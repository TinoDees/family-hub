import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { ensureGroceryCategories, getRetailers, legacySlugFor } from "@/lib/grocery-data";
import { guessCategory } from "@/lib/groceries";
import { ShoppingPlan, type SeedRow } from "@/components/shopping-plan";

/**
 * Plan the shop — seeds the worksheet from the week's planned recipes
 * (aggregated, scaled by servings) plus every pantry staple below its min.
 */

function mondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function ShoppingPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { membership, access } = await requireModule("shopping", "view");
  const canEdit = access === "edit";
  const { from, to } = await searchParams;

  const monday = from && /^\d{4}-\d{2}-\d{2}$/.test(from)
    ? mondayOf(new Date(`${from}T00:00:00`))
    : mondayOf(new Date());
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekStart = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : iso(monday);
  const weekEnd = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : iso(sunday);
  const weekLabel = `week of ${new Date(`${weekStart}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`;

  const cats = await ensureGroceryCategories(membership.household_id);
  const retailers = await getRetailers(membership.household_id);
  const supabase = await createClient();

  const [{ data: entries }, { data: pantry }] = await Promise.all([
    supabase
      .from("meal_plan_entries")
      .select("recipe_id, servings, recipe:recipes!meal_plan_entries_recipe_id_fkey(servings)")
      .eq("household_id", membership.household_id)
      .gte("entry_date", weekStart)
      .lte("entry_date", weekEnd)
      .not("recipe_id", "is", null),
    supabase
      .from("pantry_items")
      .select("id, name, category_id, retailer_id, unit, min_qty, max_qty, soh")
      .eq("household_id", membership.household_id),
  ]);

  // aggregate the week's ingredients, scaled by planned servings
  const recipeIds = [...new Set((entries ?? []).map((e) => e.recipe_id))] as string[];
  const { data: ingredients } = recipeIds.length
    ? await supabase
        .from("recipe_ingredients")
        .select("recipe_id, name, qty, unit")
        .in("recipe_id", recipeIds)
    : { data: [] as { recipe_id: string; name: string; qty: number | null; unit: string | null }[] };

  const byRecipe = new Map<string, NonNullable<typeof ingredients>>();
  for (const i of ingredients ?? []) byRecipe.set(i.recipe_id, [...(byRecipe.get(i.recipe_id) ?? []), i]);

  const agg = new Map<string, { name: string; unit: string | null; qty: number | null }>();
  for (const e of entries ?? []) {
    const base = (e.recipe as unknown as { servings: number } | null)?.servings ?? 4;
    const factor = e.servings && base ? e.servings / base : 1;
    for (const i of byRecipe.get(e.recipe_id!) ?? []) {
      const key = `${i.name.toLowerCase()}|${i.unit ?? ""}`;
      const scaled = i.qty !== null ? Number(i.qty) * factor : null;
      const cur = agg.get(key);
      if (cur && cur.qty !== null && scaled !== null) cur.qty += scaled;
      else if (!cur) agg.set(key, { name: i.name, unit: i.unit, qty: scaled });
      else cur.qty = null;
    }
  }

  const pantryByName = new Map(
    (pantry ?? []).map((p) => [p.name.toLowerCase().trim(), p])
  );

  const seed: SeedRow[] = [];
  const matchedPantryIds = new Set<string>();
  for (const ing of [...agg.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const match = pantryByName.get(ing.name.toLowerCase().trim()) ?? null;
    if (match) matchedPantryIds.add(match.id);
    seed.push({
      key: `r-${ing.name.toLowerCase()}|${ing.unit ?? ""}`,
      name: ing.name,
      source: "recipes",
      neededQty: ing.qty !== null ? Math.round(ing.qty * 100) / 100 : null,
      unit: ing.unit ?? match?.unit ?? null,
      category: match ? legacySlugFor(cats, match.category_id) : guessCategory(ing.name),
      pantryItemId: match?.id ?? null,
      soh: match?.soh !== null && match?.soh !== undefined ? Number(match.soh) : null,
      minQty: match?.min_qty !== null && match?.min_qty !== undefined ? Number(match.min_qty) : null,
      maxQty: match?.max_qty !== null && match?.max_qty !== undefined ? Number(match.max_qty) : null,
      retailerId: match?.retailer_id ?? null,
    });
  }

  // staples below their min (and not already covered by a recipe row)
  for (const p of (pantry ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
    if (matchedPantryIds.has(p.id)) continue;
    if (p.min_qty === null) continue;
    if ((p.soh !== null ? Number(p.soh) : 0) >= Number(p.min_qty)) continue;
    seed.push({
      key: `s-${p.id}`,
      name: p.name,
      source: "staple",
      neededQty: null,
      unit: p.unit,
      category: legacySlugFor(cats, p.category_id),
      pantryItemId: p.id,
      soh: p.soh !== null ? Number(p.soh) : null,
      minQty: Number(p.min_qty),
      maxQty: p.max_qty !== null ? Number(p.max_qty) : null,
      retailerId: p.retailer_id,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-500">
          Planning the shop for the{" "}
          <Link href={`/meals?w=${weekStart}`} className="underline hover:text-stone-700">
            {weekLabel}
          </Link>{" "}
          — the week&apos;s recipe ingredients plus staples running low.
        </p>
        <div className="flex gap-2 text-sm">
          <Link
            href={`/shopping/plan?from=${iso(new Date(monday.getTime() - 7 * 864e5))}`}
            className="rounded-lg border border-stone-300 px-2.5 py-1 hover:bg-stone-100"
          >
            ← prev week
          </Link>
          <Link
            href={`/shopping/plan?from=${iso(new Date(monday.getTime() + 7 * 864e5))}`}
            className="rounded-lg border border-stone-300 px-2.5 py-1 hover:bg-stone-100"
          >
            next week →
          </Link>
        </div>
      </div>
      <ShoppingPlan seed={seed} retailers={retailers} weekLabel={weekLabel} canEdit={canEdit} />
    </div>
  );
}
