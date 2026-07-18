import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFinance } from "@/lib/finance";
import { RulesGrid } from "@/components/rules-grid";

/** The rule book: user-written bank rules — contains X → allocate category Y. */
export default async function RulesPage() {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();

  const [{ data: rules }, { data: categories }] = await Promise.all([
    supabase
      .from("finance_rules")
      .select("id, match_text, match_field, category_id, enabled, created_at")
      .eq("household_id", membership.household_id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase
      .from("finance_categories")
      .select("id, name, icon, kind")
      .eq("household_id", membership.household_id)
      .order("kind")
      .order("name"),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/finance" className="text-xs text-stone-400 hover:underline">← Finance</Link>
        <h1 className="text-2xl font-semibold">📖 Rule book</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-400">
          Your standing instructions for the bank feed: when a transaction contains a certain text,
          Nestly allocates the category for you — it lands as 🪄 to-confirm, so you always keep the
          final tick. Rules beat the automatic per-merchant memory. Tip: the 📖 button on any
          transaction starts a rule from it.
        </p>
      </div>
      <RulesGrid rules={rules ?? []} categories={categories ?? []} />
    </div>
  );
}
