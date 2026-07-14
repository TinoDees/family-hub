import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { colorFor } from "@/lib/planner";
import { ChatClient } from "@/components/chat-client";
import { markConversationRead } from "@/lib/actions/conversations";

export default async function DmPage({ params }: { params: Promise<{ id: string }> }) {
  const { membership, userId } = await requireModule("messages", "view");
  const { id } = await params;
  const supabase = await createClient();

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, is_group, title, conversation_participants(user_id)")
    .eq("id", id)
    .maybeSingle();
  if (!conv) notFound();

  const participantIds = (conv.conversation_participants ?? []).map((p) => p.user_id);
  const mine = participantIds.includes(userId);

  const [{ data: messages }, { data: members }] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("id, sender, body, created_at")
      .eq("channel_kind", "dm")
      .eq("channel_id", id)
      .order("created_at")
      .limit(200),
    supabase
      .from("household_members")
      .select("user_id, display_name")
      .eq("household_id", membership.household_id)
      .order("joined_at"),
  ]);

  const names: Record<string, string> = {};
  const colors: Record<string, string> = {};
  (members ?? []).forEach((m, i) => {
    names[m.user_id] = m.display_name ?? "Member";
    colors[m.user_id] = colorFor(i);
  });
  const unknown = participantIds.filter((p) => !names[p]);
  if (unknown.length > 0) {
    const { data: parts } = await supabase
      .from("trip_participants")
      .select("user_id, name")
      .in("user_id", unknown);
    (parts ?? []).forEach((p, i) => {
      if (p.user_id && !names[p.user_id]) {
        names[p.user_id] = p.name;
        colors[p.user_id] = colorFor((members?.length ?? 0) + i);
      }
    });
  }

  const others = participantIds.filter((p) => p !== userId);
  const title =
    conv.title ?? (others.length > 0 ? others.map((p) => names[p] ?? "Member").join(", ") : "Chat");

  if (mine) await markConversationRead(id);

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div>
        <Link href="/messages" className="text-xs text-stone-400 hover:underline">← Messages</Link>
        <h1 className="text-xl font-semibold">
          {conv.is_group ? "👥" : "👤"} {title}
        </h1>
        {!mine && (
          <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            👁 You&apos;re viewing this chat as a parent — you can read it because a child of your
            household is in it, but you can&apos;t post here.
          </p>
        )}
      </div>
      <ChatClient
        channelKind="dm"
        channelId={id}
        initialMessages={messages ?? []}
        meId={userId}
        names={names}
        colors={colors}
        readOnly={!mine}
      />
    </div>
  );
}
