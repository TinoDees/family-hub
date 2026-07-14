import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { startConversation } from "@/lib/actions/conversations";
import { inputCls } from "@/components/auth-card";

export default async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { membership, userId } = await requireModule("messages", "view");
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: members }, { data: myTrips }] = await Promise.all([
    supabase
      .from("household_members")
      .select("user_id, display_name, role")
      .eq("household_id", membership.household_id)
      .order("joined_at"),
    supabase.from("trip_participants").select("trip_id").eq("user_id", userId),
  ]);

  const memberIds = new Set((members ?? []).map((m) => m.user_id));
  const companions: { user_id: string; name: string }[] = [];
  const tripIds = (myTrips ?? []).map((t) => t.trip_id);
  if (tripIds.length > 0) {
    const { data: parts } = await supabase
      .from("trip_participants")
      .select("user_id, name")
      .in("trip_id", tripIds)
      .not("user_id", "is", null);
    const seen = new Set<string>();
    for (const p of parts ?? []) {
      if (!p.user_id || p.user_id === userId || memberIds.has(p.user_id) || seen.has(p.user_id)) continue;
      seen.add(p.user_id);
      companions.push({ user_id: p.user_id, name: p.name });
    }
  }

  const family = (members ?? []).filter((m) => m.user_id !== userId);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <Link href="/messages" className="text-xs text-stone-400 hover:underline">← Messages</Link>
        <h1 className="text-xl font-semibold">New chat</h1>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <form action={startConversation} className="space-y-4 rounded-xl border border-stone-200 bg-white p-4">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Family</h2>
          <div className="space-y-1.5">
            {family.map((m) => (
              <label key={m.user_id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-stone-50">
                <input type="checkbox" name="to" value={m.user_id} className="rounded border-stone-300" />
                <span className="font-medium">{m.display_name ?? "Member"}</span>
                <span className="text-xs capitalize text-stone-400">{m.role}</span>
              </label>
            ))}
          </div>
        </div>

        {companions.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold">Trip companions</h2>
            <div className="space-y-1.5">
              {companions.map((c) => (
                <label key={c.user_id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-stone-50">
                  <input type="checkbox" name="to" value={c.user_id} className="rounded border-stone-300" />
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-stone-400">guest</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">
            Group name <span className="font-normal">(only for group chats — leave empty for 1:1)</span>
          </label>
          <input name="title" placeholder="e.g. Kids" className={inputCls} />
        </div>

        <button className="w-full rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700">
          Start chat
        </button>
      </form>
      <p className="text-xs text-stone-400">
        Parents can view any chat a child in the family is part of — chats between adults are private.
      </p>
    </div>
  );
}
