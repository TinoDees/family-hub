import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { PantryManager } from "@/components/pantry-manager";
import type { PantryItem } from "@/lib/actions/pantry";

export default async function PantryPage() {
  const { membership, access } = await requireModule("shopping", "view");
  const canEdit = access === "edit";

  const supabase = await createClient();
  const { data: items } = await supabase
    .from("pantry_items")
    .select("id, name, category, unit, min_qty, max_qty")
    .eq("household_id", membership.household_id)
    .order("category")
    .order("name");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/shopping" className="text-xs text-stone-400 hover:underline">← Lists</Link>
        <h1 className="text-2xl font-semibold">🧺 Staples</h1>
        <p className="mt-1 text-sm text-stone-500">
          The things your household always needs, beyond recipe ingredients. Add them to
          any shopping list with one tap. Min/max targets are optional — set them if you
          want suggested quantities later, ignore them if you don&apos;t.
        </p>
      </div>
      <PantryManager initial={(items ?? []) as PantryItem[]} canEdit={canEdit} />
    </div>
  );
}
