"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";

export async function createList(formData: FormData) {
  const { membership, userId } = await requireModule("shopping", "edit");
  const name = String(formData.get("name") ?? "").trim() || "Shopping list";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shopping_lists")
    .insert({ household_id: membership.household_id, name, created_by: userId })
    .select("id")
    .single();
  if (error || !data) redirect(`/shopping?error=${encodeURIComponent(error?.message ?? "failed")}`);
  redirect(`/shopping/${data.id}`);
}

export async function addItem(formData: FormData) {
  const { membership } = await requireModule("shopping", "edit");
  const listId = String(formData.get("list_id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect(`/shopping/${listId}`);
  const supabase = await createClient();
  const { count } = await supabase
    .from("shopping_list_items")
    .select("id", { count: "exact", head: true })
    .eq("list_id", listId);
  await supabase.from("shopping_list_items").insert({
    list_id: listId,
    household_id: membership.household_id,
    name,
    qty: String(formData.get("qty") ?? "").trim() || null,
    position: (count ?? 0) + 1,
  });
  revalidatePath(`/shopping/${listId}`);
  redirect(`/shopping/${listId}`);
}

export async function toggleItem(formData: FormData) {
  const { userId } = await requireModule("shopping", "edit");
  const listId = String(formData.get("list_id"));
  const supabase = await createClient();
  const checked = formData.get("checked") === "1";
  await supabase
    .from("shopping_list_items")
    .update({ checked, checked_by: checked ? userId : null })
    .eq("id", String(formData.get("item_id")));
  revalidatePath(`/shopping/${listId}`);
  redirect(`/shopping/${listId}`);
}

export async function deleteItem(formData: FormData) {
  await requireModule("shopping", "edit");
  const listId = String(formData.get("list_id"));
  const supabase = await createClient();
  await supabase.from("shopping_list_items").delete().eq("id", String(formData.get("item_id")));
  revalidatePath(`/shopping/${listId}`);
  redirect(`/shopping/${listId}`);
}

export async function setListStatus(formData: FormData) {
  const { membership } = await requireModule("shopping", "edit");
  const supabase = await createClient();
  await supabase
    .from("shopping_lists")
    .update({ status: String(formData.get("status")) })
    .eq("id", String(formData.get("list_id")))
    .eq("household_id", membership.household_id);
  revalidatePath("/shopping");
  redirect("/shopping");
}

/** Build a shopping list from the meal plan week's scaled ingredients. */
export async function shoppingListFromWeek(formData: FormData) {
  const { membership, userId } = await requireModule("shopping", "edit");
  const weekStart = String(formData.get("week_start"));
  const weekEnd = String(formData.get("week_end"));
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from("meal_plan_entries")
    .select("recipe_id, servings, recipe:recipes!meal_plan_entries_recipe_id_fkey(servings)")
    .eq("household_id", membership.household_id)
    .gte("entry_date", weekStart)
    .lte("entry_date", weekEnd)
    .not("recipe_id", "is", null);

  const recipeIds = [...new Set((entries ?? []).map((e) => e.recipe_id))] as string[];
  if (recipeIds.length === 0)
    redirect(`/meals?w=${weekStart}&error=No+recipes+planned+this+week`);

  const { data: ingredients } = await supabase
    .from("recipe_ingredients")
    .select("recipe_id, name, qty, unit")
    .in("recipe_id", recipeIds);

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

  const label = new Date(`${weekStart}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  const { data: list, error } = await supabase
    .from("shopping_lists")
    .insert({
      household_id: membership.household_id,
      name: `Groceries — week of ${label}`,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !list) redirect(`/meals?w=${weekStart}&error=${encodeURIComponent(error?.message ?? "failed")}`);

  const items = [...agg.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((i, idx) => ({
      list_id: list.id,
      household_id: membership.household_id,
      position: idx,
      name: i.name,
      qty: i.qty !== null ? `${Math.round(i.qty * 100) / 100}${i.unit ? ` ${i.unit}` : ""}` : null,
    }));
  if (items.length > 0) await supabase.from("shopping_list_items").insert(items);

  redirect(`/shopping/${list.id}`);
}
