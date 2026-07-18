import { createClient } from "@/lib/supabase/server";
import { GROCERY_CATEGORIES } from "@/lib/groceries";

/**
 * Household grocery data (mig 053): categories (seeded from the built-in set,
 * editable, one sub-level via parent_id) and retailers. Server-side helpers —
 * the single place that seeds and fetches (one-place rule).
 */

export type GroceryCat = {
  id: string;
  name: string;
  emoji: string | null;
  parent_id: string | null;
  builtin_slug: string | null;
  position: number;
};

export type Retailer = { id: string; name: string; position: number };

const CAT_SELECT = "id, name, emoji, parent_id, builtin_slug, position";

/**
 * Fetch the household's categories, seeding the built-in set on first touch
 * (and back-filling pantry_items.category_id from the legacy text column).
 * Safe to call from view-only sessions — the seed insert just no-ops on RLS.
 */
export async function ensureGroceryCategories(householdId: string): Promise<GroceryCat[]> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("grocery_categories")
    .select(CAT_SELECT)
    .eq("household_id", householdId)
    .order("position")
    .order("name");
  if (existing && existing.length > 0) return existing as GroceryCat[];

  await supabase.from("grocery_categories").insert(
    GROCERY_CATEGORIES.map((c, idx) => ({
      household_id: householdId,
      name: c.label,
      emoji: c.emoji,
      builtin_slug: c.id,
      position: idx,
    }))
  ); // unique partial index makes concurrent seeding harmless

  const { data: cats } = await supabase
    .from("grocery_categories")
    .select(CAT_SELECT)
    .eq("household_id", householdId)
    .order("position")
    .order("name");

  // back-fill pantry items created before the hub existed
  for (const c of cats ?? []) {
    if (!c.builtin_slug) continue;
    await supabase
      .from("pantry_items")
      .update({ category_id: c.id })
      .eq("household_id", householdId)
      .eq("category", c.builtin_slug)
      .is("category_id", null);
  }
  return (cats ?? []) as GroceryCat[];
}

export async function getRetailers(householdId: string): Promise<Retailer[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("retailers")
    .select("id, name, position")
    .eq("household_id", householdId)
    .order("position")
    .order("name");
  return (data ?? []) as Retailer[];
}

/** Top-level builtin slug for a category id (walks one parent step) — used to
 * keep the legacy shopping_list_items.category text in sync for grouping. */
export function legacySlugFor(cats: GroceryCat[], categoryId: string | null): string {
  if (!categoryId) return "other";
  const cat = cats.find((c) => c.id === categoryId);
  if (!cat) return "other";
  const top = cat.parent_id ? cats.find((c) => c.id === cat.parent_id) ?? cat : cat;
  return top.builtin_slug ?? "other";
}
