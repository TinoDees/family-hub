import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWebPush, pushConfigured } from "@/lib/web-push";

export const runtime = "nodejs";

/**
 * Called by the Supabase DB webhook (trigger on chat_messages insert, mig 027)
 * with an x-push-secret header. The DB is the trigger — not the sender's
 * browser — so pushes fire no matter how old the sender's tab is.
 * RLS already vetted the insert; here we only fan out notifications.
 */
export async function POST(req: Request) {
  if (!pushConfigured()) return NextResponse.json({ ok: false, reason: "push not configured" });

  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-push-secret") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let record: { channel_kind?: string; channel_id?: string; sender?: string; body?: string };
  try {
    ({ record } = await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const kind = record?.channel_kind;
  const channelId = record?.channel_id;
  const senderId = record?.sender;
  const body = record?.body;
  if (
    !kind ||
    !["household", "trip"].includes(kind) ||
    typeof channelId !== "string" ||
    typeof senderId !== "string" ||
    typeof body !== "string" ||
    !body.trim()
  ) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

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
  let senderName = (members ?? []).find((m) => m.user_id === senderId)?.display_name ?? null;

  if (kind === "trip") {
    const { data: parts } = await admin
      .from("trip_participants")
      .select("user_id, name")
      .eq("trip_id", channelId)
      .not("user_id", "is", null);
    for (const p of parts ?? []) {
      if (!p.user_id) continue;
      if (!memberIds.has(p.user_id)) urlByUser.set(p.user_id, `/guest/${channelId}`); // guests land on their page
      if (p.user_id === senderId && !senderName) senderName = p.name;
    }
  }

  urlByUser.delete(senderId); // never notify the sender (any of their devices)
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
