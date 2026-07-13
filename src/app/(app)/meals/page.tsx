import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { addMealEntry, removeMealEntry } from "@/lib/actions/meals";
import { shoppingListFromWeek } from "@/lib/actions/shopping";

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
  const weekKey = iso(monday);
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
      const key = `${i.name.toLowerCase()}|${i.unit ?? ""}`;
      const cur = agg.get(key);
      const scaledQty = i.qty !== null ? Number(i.qty) * factor : null;
      if (cur && cur.qty !== null && scaledQty !== null) cur.qty += scaledQty;
      else if (!cur) agg.set(key, { name: i.name, unit: i.unit, qty: scaledQty });
      else cur.qty = null;
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
                  const cellEntries = byCell.get(key) ?? [];
                  return (
                    <td key={key} className={`px-1.5 py-2 ${iso(d) === todayIso ? "bg-amber-50/50" : ""}`}>
                      <div className="space-y-1">
                        {cellEntries.map((e) => (
                          <div key={e.id} className="group flex items-start justify-between gap-1 rounded-lg bg-stone-100 px-2 py-1 text-xs">
                            {e.recipe_id ? (
                              <Link href={`/recipes/${e.recipe_id}`} className="hover:underline">
                                {(e.recipe as unknown as { name: string } | null)?.name ?? "Recipe"}
                                {e.servings && <span className="text-stone-400"> ×{e.servings}</span>}
                              </Link>
                            ) : (
                              <span>{e.custom_text}</span>
                            )}
                            {canEdit && (
                              <form action={removeMealEntry}>
                                <input type="hidden" name="entry_id" value={e.id} />
                                <input type="hidden" name="w" value={weekKey} />
                                <button className="text-stone-300 hover:text-red-600" title="Remove">✕</button>
                              </form>
                            )}
                          </div>
                        ))}
                        {canEdit && (
                          <details className="text-xs">
                            <summary className="cursor-pointer rounded px-1 text-stone-300 hover:text-stone-500">+ add</summary>
                            <form action={addMealEntry} className="mt-1 space-y-1">
                              <input type="hidden" name="entry_date" value={iso(d)} />
                              <input type="hidden" name="slot" value={slot} />
                              <input type="hidden" name="w" value={weekKey} />
                              <select name="recipe_id" className="w-full rounded border border-stone-200 bg-white px-1 py-1 text-xs">
                                <option value="">— recipe —</option>
                                {(recipes ?? []).map((r) => (
                                  <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                              </select>
                              <input name="servings" type="number" min="1" placeholder="serves (optional)" className="w-full rounded border border-stone-200 px-1 py-1 text-xs" />
                              <input name="custom_text" placeholder="or free text" className="w-full rounded border border-stone-200 px-1 py-1 text-xs" />
                              <button className="w-full rounded bg-stone-900 px-1 py-1 text-xs text-white hover:bg-stone-700">Add</button>
                            </form>
                          </details>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {agg.size > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">This week&apos;s ingredients</h2>
            {access === "edit" && (
              <form action={shoppingListFromWeek}>
                <input type="hidden" name="week_start" value={iso(days[0])} />
                <input type="hidden" name="week_end" value={iso(days[6])} />
                <button className="rounded-lg bg-stone-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-700">
                  🛒 Create shopping list
                </button>
              </form>
            )}
          </div>
          <p className="mt-1 text-xs text-stone-400">
            Aggregated from planned recipes, scaled by planned servings.
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
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
        </div>
      )}
    </div>
  );
}
