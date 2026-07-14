import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { colorFor } from "@/lib/planner";
import { ChatClient } from "@/components/chat-client";

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { membership, userId } = await requireModule("messages", "view");
  const { kind, id } = await params;
  if (!["household", "trip"].includes(kind)) notFound();

  const supabase = await createClient();

  let title = membership.household.name;
  if (kind === "trip") {
    const { data: trip } = await supabase.from("trips").select("id, name").eq("id", id).maybeSingle();
    if (!trip) notFound();
    title = trip.name;
  } else if (id !== membership.household_id) {
    notFound();
  }

  const [{ data: messages }, { data: members }, { data: participants }] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("id, sender, body, created_at")
      .eq("channel_kind", kind)
      .eq("channel_id", id)
      .order("created_at")
      .limit(200),
    supabase
      .from("household_members")
      .select("user_id, display_name")
      .eq("household_id", membership.household_id)
      .order("joined_at"),
    kind === "trip"
      ? supabase.from("trip_participants").select("user_id, name").eq("trip_id", id).not("user_id", "is", null)
      : Promise.resolve({ data: [] }),
  ]);

  const names: Record<string, string> = {};
  const colors: Record<string, string> = {};
  (members ?? []).forEach((m, i) => {
    names[m.user_id] = m.display_name ?? "Member";
    colors[m.user_id] = colorFor(i);
  });
  (participants ?? []).forEach((p, i) => {
    if (p.user_id && !names[p.user_id]) {
      names[p.user_id] = p.name;
      colors[p.user_id] = colorFor((members?.length ?? 0) + i);
    }
  });

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div>
        <Link href="/messages" className="text-xs text-stone-400 hover:underline">← Channels</Link>
        <h1 className="text-xl font-semibold">
          {kind === "household" ? "🏠" : "✈️"} {title}
        </h1>
      </div>
      <ChatClient
        channelKind={kind}
        channelId={id}
        initialMessages={messages ?? []}
        meId={userId}
        names={names}
        colors={colors}
      />
    </div>
  );
}
