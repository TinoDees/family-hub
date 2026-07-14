import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { PushToggle } from "@/components/push-toggle";

type ConvRow = {
  id: string;
  is_group: boolean;
  title: string | null;
  conversation_participants: { user_id: string; last_read_at: string }[];
};

export default async function MessagesPage() {
  const { membership, userId } = await requireModule("messages", "view");
  const supabase = await createClient();

  const [{ data: trips }, { data: convs }, { data: members }, { data: guestParts }] = await Promise.all([
    supabase
      .from("trips")
      .select("id, name, status")
      .eq("household_id", membership.household_id)
      .neq("status", "completed")
      .order("created_at", { ascending: false }),
    supabase
      .from("conversations")
      .select("id, is_group, title, conversation_participants(user_id, last_read_at)")
      .order("created_at", { ascending: false }),
    supabase
      .from("household_members")
      .select("user_id, display_name, role")
      .eq("household_id", membership.household_id),
    supabase
      .from("trip_participants")
      .select("trip_id, trips!inner(id, name, household_id)")
      .eq("user_id", userId)
      .neq("trips.household_id", membership.household_id),
  ]);
  const guestTrips = (guestParts ?? [])
    .map((g) => g.trips as unknown as { id: string; name: string })
    .filter(Boolean);

  const names = new Map((members ?? []).map((m) => [m.user_id, m.display_name ?? "Member"]));
  const conversations = (convs ?? []) as ConvRow[];

  // fill names for trip companions appearing in conversations
  const unknown = new Set<string>();
  for (const c of conversations)
    for (const p of c.conversation_participants) if (!names.has(p.user_id)) unknown.add(p.user_id);
  if (unknown.size > 0) {
    const { data: parts } = await supabase
      .from("trip_participants")
      .select("user_id, name")
      .in("user_id", [...unknown]);
    for (const p of parts ?? []) if (p.user_id) names.set(p.user_id, p.name);
  }

  // latest message per conversation for preview + unread
  const convIds = conversations.map((c) => c.id);
  const lastByConv = new Map<string, { body: string; created_at: string; sender: string }>();
  if (convIds.length > 0) {
    const { data: lastMsgs } = await supabase
      .from("chat_messages")
      .select("channel_id, body, created_at, sender")
      .eq("channel_kind", "dm")
      .in("channel_id", convIds)
      .order("created_at", { ascending: false })
      .limit(300);
    for (const m of lastMsgs ?? [])
      if (!lastByConv.has(m.channel_id)) lastByConv.set(m.channel_id, m);
  }

  const dmList = conversations
    .map((c) => {
      const meRow = c.conversation_participants.find((p) => p.user_id === userId);
      const others = c.conversation_participants.filter((p) => p.user_id !== userId);
      const last = lastByConv.get(c.id);
      return {
        id: c.id,
        label:
          c.title ??
          (others.length > 0
            ? others.map((p) => names.get(p.user_id) ?? "Member").join(", ")
            : "Just you"),
        isGroup: c.is_group,
        mine: Boolean(meRow),
        unread: Boolean(
          meRow && last && last.sender !== userId && last.created_at > meRow.last_read_at
        ),
        preview: last ? last.body.slice(0, 60) : null,
        lastAt: last?.created_at ?? null,
      };
    })
    .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">💬 Messages</h1>
        <Link
          href="/messages/new"
          className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
        >
          + New chat
        </Link>
      </div>
      <PushToggle />

      <div className="space-y-2">
        <Link
          href={`/messages/household/${membership.household_id}`}
          className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
        >
          <span className="text-2xl">🏠</span>
          <div>
            <div className="font-medium">{membership.household.name}</div>
            <div className="text-xs text-stone-400">The whole family</div>
          </div>
        </Link>
        {(trips ?? []).map((t) => (
          <Link
            key={t.id}
            href={`/messages/trip/${t.id}`}
            className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="text-2xl">✈️</span>
            <div>
              <div className="font-medium">{t.name}</div>
              <div className="text-xs text-stone-400">Everyone on the trip — all families</div>
            </div>
          </Link>
        ))}
        {guestTrips.map((t) => (
          <Link
            key={t.id}
            href={`/messages/trip/${t.id}`}
            className="flex items-center gap-3 rounded-xl border border-sky-200 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="text-2xl">🧳</span>
            <div>
              <div className="font-medium">{t.name}</div>
              <div className="text-xs text-stone-400">A trip you&apos;re invited to</div>
            </div>
          </Link>
        ))}
      </div>

      {dmList.length > 0 && (
        <div className="space-y-2">
          <h2 className="pt-2 text-sm font-semibold text-stone-500">Chats</h2>
          {dmList.map((c) => (
            <Link
              key={c.id}
              href={`/messages/dm/${c.id}`}
              className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
            >
              <span className="text-2xl">{c.isGroup ? "👥" : "👤"}</span>
              <div className="min-w-0 flex-1">
                <div className={`flex items-center gap-2 ${c.unread ? "font-semibold" : "font-medium"}`}>
                  <span className="truncate">{c.label}</span>
                  {c.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500" />}
                  {!c.mine && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      👁 child&apos;s chat
                    </span>
                  )}
                </div>
                {c.preview && <div className="truncate text-xs text-stone-400">{c.preview}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="text-xs text-stone-400">
        Family and trip channels include everyone. Chats are 1:1 or small groups — parents can
        view any chat a child is part of.
      </p>
    </div>
  );
}
