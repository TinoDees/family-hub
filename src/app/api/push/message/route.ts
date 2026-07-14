import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWebPush, pushConfigured } from "@/lib/web-push";

export const runtime = "nodejs";

/**
 * Fired (fire-and-forget) by the chat client after a message is inserted.
 * Verifies the caller may chat in the channel, then pushes to every other
 * participant's subscribed devices. Guests get deep links to their guest page.
 */
export async function POST(req: Request) {
  if (!pushConfigured()) return NextResponse.json({ ok: false, reason: "push not configured" });

  let kind: string, channelId: string, body: string;
  try {
    ({ kind, channelId, body } = await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (
    !["household", "trip"].includes(kind) ||
    typeof channelId !== "string" ||
    typeof body !== "string" ||
    !body.trim()
  ) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: allowed } = await supabase.rpc("can_chat", { p_kind: kind, p_channel: channelId });
  if (!allowed) return NextResponse.json({ ok: false }, { status: 403 });

  const admin = createAdminClient();

  // Resolve channel name + the household behind it
  let householdId = channelId;
  let channelName = "Family chat";
  if (kind === "trip") {
    const { data: trip } = await admin
      .from("trips")
      .select("name, household_id")
      .eq("id", channelId)
      .maybeSingle();
    if (!trip) return NextResponse.json({ ok: false }, { status: 404 });
    householdId = trip.household_id;
    channelName = trip.name;
  } else {
    const { data: hh } = await admin.from("households").select("name").eq("id", channelId).maybeSingle();
    if (hh?.name) channelName = hh.name;
  }

  const { data: members } = await admin
    .from("household_members")
    .select("user_id, display_name")
    .eq("household_id", householdId);
  const memberIds = new Set((members ?? []).map((m) => m.user_id));
  const appUrl = `/messages/${kind}/${channelId}`;
  const urlByUser = new Map<string, string>((members ?? []).map((m) => [m.user_id, appUrl]));
  let senderName = (members ?? []).find((m) => m.user_id === user.id)?.display_name ?? null;

  if (kind === "trip") {
    const { data: parts } = await admin
      .from("trip_participants")
      .select("user_id, name")
      .eq("trip_id", channelId)
      .not("user_id", "is", null);
    for (const p of parts ?? []) {
      if (!p.user_id) continue;
      if (!memberIds.has(p.user_id)) urlByUser.set(p.user_id, `/guest/${channelId}`); // guests land on their page
      if (p.user_id === user.id && !senderName) senderName = p.name;
    }
  }

  urlByUser.delete(user.id); // never notify the sender
  const recipientIds = [...urlByUser.keys()];
  if (recipientIds.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", recipientIds);
  if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const payloadBase = {
    title: `${senderName ?? "Someone"} · ${channelName}`,
    body: body.trim().slice(0, 140),
    tag: `nestly-chat-${channelId}`,
  };

  let sent = 0;
  await Promise.allSettled(
    subs.map(async (s) => {
      const status = await sendWebPush(s, { ...payloadBase, url: urlByUser.get(s.user_id) ?? "/messages" });
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("id", s.id); // dead device — prune
      } else if (status >= 200 && status < 300) {
        sent++;
      }
    })
  );

  return NextResponse.json({ ok: true, sent });
}
