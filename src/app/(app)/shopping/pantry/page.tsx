import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { PantryManager } from "@/components/pantry-manager";
import { ensureGroceryCategories, getRetailers } from "@/lib/grocery-data";
import type { PantryItem } from "@/lib/actions/pantry";

export default async function PantryPage() {
  const { membership, access } = await requireModule("shopping", "view");
  const canEdit = access === "edit";

  const categories = await ensureGroceryCategories(membership.household_id);
  const retailers = await getRetailers(membership.household_id);

  const supabase = await createClient();
  const { data: items } = await supabase
    .from("pantry_items")
    .select("id, name, category_id, retailer_id, unit, min_qty, max_qty, soh")
    .eq("household_id", membership.household_id)
    .order("name");

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        The master catalog of everything your household buys — ingredients and staples.
        Categories, retailer preferences and min/max targets are optional layers; a bare
        name is a complete entry.
      </p>
      <PantryManager
        initial={(items ?? []) as PantryItem[]}
        categories={categories}
        retailers={retailers}
        canEdit={canEdit}
      />
    </div>
  );
}
