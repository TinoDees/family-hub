import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";

export default async function MessagesPage() {
  const { membership } = await requireModule("messages", "view");
  const supabase = await createClient();

  const { data: trips } = await supabase
    .from("trips")
    .select("id, name, status")
    .eq("household_id", membership.household_id)
    .neq("status", "completed")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">💬 Messages</h1>
      <p className="text-sm text-stone-500">
        Everyone in the family sees the family channel — including parents. Trip channels
        include your travel companions from other families.
      </p>

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
      </div>
    </div>
  );
}
