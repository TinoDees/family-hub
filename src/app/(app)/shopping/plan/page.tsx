import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { ensureGroceryCategories, getRetailers, legacySlugFor } from "@/lib/grocery-data";
import { guessCategory } from "@/lib/groceries";
import { ShoppingPlan, type SeedRow, type PlanSource } from "@/components/shopping-plan";
import { PlanRange } from "@/components/plan-range";

/**
 * Plan the shop — merges the three streams into one deduped worksheet:
 * notes jotted during the week, staples below their min, and the week's
 * recipe ingredients (aggregated, scaled by servings).
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

  // arbitrary date range; defaults to the current Monday–Sunday week
  const validDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const monday = mondayOf(new Date());
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekStart = validDate(from) ?? iso(monday);
  let weekEnd = validDate(to) ?? (validDate(from)
    ? iso(new Date(new Date(`${weekStart}T00:00:00`).getTime() + 6 * 864e5))
    : iso(sunday));
  if (weekEnd < weekStart) weekEnd = weekStart;

  const fmtShort = (s: string) =>
    new Date(`${s}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  const isStandardWeek =
    new Date(`${weekStart}T00:00:00`).getDay() === 1 &&
    weekEnd === iso(new Date(new Date(`${weekStart}T00:00:00`).getTime() + 6 * 864e5));
  const weekLabel = isStandardWeek
    ? `week of ${fmtShort(weekStart)}`
    : `${fmtShort(weekStart)} – ${fmtShort(weekEnd)}`;

  const cats = await ensureGroceryCategories(membership.household_id);
  const retailers = await getRetailers(membership.household_id);
  const supabase = await createClient();

  const [{ data: entries }, { data: pantry }, { data: notes }] = await Promise.all([
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
    supabase
      .from("shopping_notes")
      .select("id, name, qty")
      .eq("household_id", membership.household_id)
      .order("created_at"),
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

  const pantryByName = new Map((pantry ?? []).map((p) => [p.name.toLowerCase().trim(), p]));
  type PantryRow = NonNullable<typeof pantry>[number];
  const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
  const belowMin = (p: PantryRow) =>
    p.min_qty !== null && (num(p.soh) ?? 0) < Number(p.min_qty);

  const seed: SeedRow[] = [];
  const byName = new Map<string, SeedRow>();
  const matchedPantryIds = new Set<string>();

  const pushRow = (row: SeedRow) => {
    seed.push(row);
    byName.set(row.name.toLowerCase().trim(), row);
  };

  // 🍽️ recipe stream
  for (const ing of [...agg.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const match = pantryByName.get(ing.name.toLowerCase().trim()) ?? null;
    if (match) matchedPantryIds.add(match.id);
    const sources: PlanSource[] = ["recipes"];
    if (match && belowMin(match)) sources.push("staple");
    pushRow({
      key: `r-${ing.name.toLowerCase()}|${ing.unit ?? ""}`,
      name: ing.name,
      sources,
      noteIds: [],
      noteQty: null,
      neededQty: ing.qty !== null ? Math.round(ing.qty * 100) / 100 : null,
      unit: ing.unit ?? match?.unit ?? null,
      category: match ? legacySlugFor(cats, match.category_id) : guessCategory(ing.name),
      pantryItemId: match?.id ?? null,
      soh: num(match?.soh),
      minQty: num(match?.min_qty),
      maxQty: num(match?.max_qty),
      retailerId: match?.retailer_id ?? null,
    });
  }

  // 🧺 staples below min not already covered by a recipe row
  for (const p of (pantry ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
    if (matchedPantryIds.has(p.id) || !belowMin(p)) continue;
    pushRow({
      key: `s-${p.id}`,
      name: p.name,
      sources: ["staple"],
      noteIds: [],
      noteQty: null,
      neededQty: null,
      unit: p.unit,
      category: legacySlugFor(cats, p.category_id),
      pantryItemId: p.id,
      soh: num(p.soh),
      minQty: num(p.min_qty),
      maxQty: num(p.max_qty),
      retailerId: p.retailer_id,
    });
  }

  // 📝 the jot list — merge into existing rows by name, else own row
  for (const n of notes ?? []) {
    const existing = byName.get(n.name.toLowerCase().trim());
    if (existing) {
      if (!existing.sources.includes("noted")) existing.sources.push("noted");
      existing.noteIds.push(n.id);
      if (!existing.noteQty && n.qty) existing.noteQty = n.qty;
      continue;
    }
    const match = pantryByName.get(n.name.toLowerCase().trim()) ?? null;
    pushRow({
      key: `n-${n.id}`,
      name: n.name,
      sources: match && belowMin(match) ? ["noted", "staple"] : ["noted"],
      noteIds: [n.id],
      noteQty: n.qty,
      neededQty: null,
      unit: match?.unit ?? null,
      category: match ? legacySlugFor(cats, match.category_id) : guessCategory(n.name),
      pantryItemId: match?.id ?? null,
      soh: num(match?.soh),
      minQty: num(match?.min_qty),
      maxQty: num(match?.max_qty),
      retailerId: match?.retailer_id ?? null,
    });
  }

  return (
    <div className="space-y-4">
      <PlanRange from={weekStart} to={weekEnd} />
      <p className="text-xs text-stone-400">
        <Link href={`/meals?w=${weekStart}`} className="underline hover:text-stone-600">
          → see the meal planner for this period
        </Link>
      </p>
      <ShoppingPlan seed={seed} retailers={retailers} weekLabel={weekLabel} canEdit={canEdit} />
    </div>
  );
}
