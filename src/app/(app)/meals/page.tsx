import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { MealCellPicker, type CellEntry } from "@/components/meal-cell-picker";
import { normalizeIngredientNames } from "@/lib/ingredients";

const SLOTS = ["breakfast", "lunch", "dinner"] as const;
const SLOT_ICON: Record<string, string> = { breakfast: "🌅", lunch: "🥪", dinner: "🍽️", snack: "🍎" };

function mondayOf(d: Date): Date {
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function MealsPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { membership, access } = await requireModule("meals", "view");
  const { w } = await searchParams;
  const canEdit = access === "edit";

  const monday = w ? mondayOf(new Date(`${w}T00:00:00`)) : mondayOf(new Date());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const prev = new Date(monday); prev.setDate(monday.getDate() - 7);
  const next = new Date(monday); next.setDate(monday.getDate() + 7);
  const todayIso = iso(new Date());

  const supabase = await createClient();
  const [{ data: entries }, { data: recipes }] = await Promise.all([
    supabase
      .from("meal_plan_entries")
      .select("id, entry_date, slot, recipe_id, custom_text, servings, recipe:recipes(name, servings)")
      .eq("household_id", membership.household_id)
      .gte("entry_date", iso(days[0]))
      .lte("entry_date", iso(days[6]))
      .order("created_at"),
    supabase
      .from("recipes")
      .select("id, name")
      .eq("household_id", membership.household_id)
      .order("name"),
  ]);

  type Entry = NonNullable<typeof entries>[number];
  const byCell = new Map<string, Entry[]>();
  for (const e of entries ?? []) {
    const k = `${e.entry_date}|${e.slot}`;
    byCell.set(k, [...(byCell.get(k) ?? []), e]);
  }
  const toCellEntry = (e: Entry): CellEntry => ({
    id: e.id,
    recipe_id: e.recipe_id,
    custom_text: e.custom_text,
    servings: e.servings,
    recipe_name: (e.recipe as unknown as { name: string } | null)?.name ?? null,
  });

  // week ingredient summary — scaled by each entry's planned servings
  const plannedRecipeIds = [...new Set((entries ?? []).map((e) => e.recipe_id).filter(Boolean))] as string[];
  const { data: weekIngredients } = plannedRecipeIds.length
    ? await supabase
        .from("recipe_ingredients")
        .select("recipe_id, name, qty, unit")
        .in("recipe_id", plannedRecipeIds)
    : { data: [] as { recipe_id: string; name: string; qty: number | null; unit: string | null }[] };

  const ingredientsByRecipe = new Map<string, NonNullable<typeof weekIngredients>>();
  for (const i of weekIngredients ?? []) {
    ingredientsByRecipe.set(i.recipe_id, [...(ingredientsByRecipe.get(i.recipe_id) ?? []), i]);
  }
  const agg = new Map<string, { name: string; unit: string | null; qty: number | null }>();
  for (const e of entries ?? []) {
    if (!e.recipe_id) continue;
    const rec = e.recipe as unknown as { name: string; servings: number } | null;
    const base = rec?.servings ?? 4;
    const factor = e.servings && base ? e.servings / base : 1;
    for (const i of ingredientsByRecipe.get(e.recipe_id) ?? []) {
      for (const name of normalizeIngredientNames(i.name)) {
        const key = `${name.toLowerCase()}|${i.unit ?? ""}`;
        const cur = agg.get(key);
        const scaledQty = i.qty !== null ? Number(i.qty) * factor : null;
        if (cur && cur.qty !== null && scaledQty !== null) cur.qty += scaledQty;
        else if (!cur) agg.set(key, { name, unit: i.unit, qty: scaledQty });
        else cur.qty = null;
      }
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">📅 Meal Planner</h1>
        <div className="flex items-center gap-2">
          <Link href={`/meals?w=${iso(prev)}`} className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100">←</Link>
          <span className="min-w-52 text-center text-sm font-medium">
            Week of {monday.toLocaleDateString("en-AU", { day: "numeric", month: "long" })}
          </span>
          <Link href={`/meals?w=${iso(next)}`} className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100">→</Link>
          <Link href="/meals" className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100">Today</Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[56rem] table-fixed text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-900 text-white">
              <th className="w-20 px-2 py-2.5" />
              {days.map((d) => (
                <th key={iso(d)} className={`px-2 py-2.5 text-center font-medium ${iso(d) === todayIso ? "bg-stone-700" : ""}`}>
                  {d.toLocaleDateString("en-AU", { weekday: "short" })}
                  <div className="text-xs font-normal text-stone-300">
                    {d.toLocaleDateString("en-AU", { day: "numeric", month: "numeric" })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot) => (
              <tr key={slot} className="border-b border-stone-100 align-top">
                <td className="px-2 py-3 text-xs font-medium capitalize text-stone-400">
                  {SLOT_ICON[slot]} {slot}
                </td>
                {days.map((d) => {
                  const key = `${iso(d)}|${slot}`;
                  const cellEntries = (byCell.get(key) ?? []).map(toCellEntry);
                  return (
                    <td key={key} className={`px-1.5 py-2 ${iso(d) === todayIso ? "bg-amber-50/50" : ""}`}>
                      <div className="min-h-14">
                        <MealCellPicker
                          date={iso(d)}
                          slot={slot}
                          initialEntries={cellEntries}
                          recipes={recipes ?? []}
                          canEdit={canEdit}
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <p className="text-xs text-stone-400">
          Type any meal. It&apos;s remembered in your <Link href="/recipes" className="underline hover:text-stone-600">recipe book</Link> and
          autocompletes next time. Ingredients are optional; add them whenever you like to power the shopping list.
        </p>
      )}

      {agg.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/50 px-5 py-4">
          <div>
            <p className="text-sm font-medium">
              This week&apos;s cooking needs <span className="text-teal-700">{agg.size} ingredient{agg.size === 1 ? "" : "s"}</span>{" "}
              across {plannedRecipeIds.length} recipe{plannedRecipeIds.length === 1 ? "" : "s"}.
            </p>
            <details className="mt-0.5">
              <summary className="cursor-pointer text-xs text-stone-400 hover:text-stone-600">
                see the ingredients
              </summary>
              <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {[...agg.values()]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((i) => (
                    <li key={`${i.name}|${i.unit}`} className="flex gap-2">
                      <span className="min-w-16 text-right font-medium text-stone-600">
                        {i.qty !== null ? `${Math.round(i.qty * 100) / 100}${i.unit ? ` ${i.unit}` : ""}` : ""}
                      </span>
                      <span>{i.name}</span>
                    </li>
                  ))}
              </ul>
            </details>
          </div>
          {access === "edit" && (
            <Link
              href={`/shopping/plan?from=${iso(days[0])}&to=${iso(days[6])}`}
              className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-600"
            >
              🛒 Plan the shop
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
