"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";

/**
 * Meal planner mutations — inline actions ({ ok, error? }) applied
 * optimistically from the cell picker (meal-cell-picker.tsx).
 */

const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

export type NewMealItem = {
  recipeId?: string | null;
  customText?: string | null;
  servings?: number | null;
};

export type AddedMealEntry = {
  id: string;
  entry_date: string;
  slot: string;
  recipe_id: string | null;
  custom_text: string | null;
  servings: number | null;
  recipe_name: string | null;
};

/** Add one or more entries (multi-select) to a day/slot cell. */
export async function addMealEntriesInline(
  entryDate: string,
  slot: string,
  items: NewMealItem[]
): Promise<{ ok: boolean; error?: string; entries?: AddedMealEntry[] }> {
  const { membership, userId } = await requireModule("meals", "edit");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return { ok: false, error: "Bad date" };
  if (!SLOTS.includes(slot as (typeof SLOTS)[number])) return { ok: false, error: "Bad slot" };

  const rows = items
    .map((i) => {
      const recipeId = i.recipeId?.trim() || null;
      const customText = i.customText?.trim().slice(0, 120) || null;
      if (!recipeId && !customText) return null;
      const servings =
        recipeId && typeof i.servings === "number" && i.servings >= 1 && i.servings <= 50
          ? Math.round(i.servings)
          : null;
      return {
        household_id: membership.household_id,
        entry_date: entryDate,
        slot,
        recipe_id: recipeId,
        custom_text: recipeId ? null : customText,
        servings,
        created_by: userId,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .slice(0, 10);
  if (rows.length === 0) return { ok: false, error: "Nothing to add" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .insert(rows)
    .select("id, entry_date, slot, recipe_id, custom_text, servings, recipe:recipes(name)");
  if (error || !data) return { ok: false, error: error?.message ?? "Could not add" };

  revalidatePath("/meals");
  return {
    ok: true,
    entries: data.map((e) => ({
      id: e.id,
      entry_date: e.entry_date,
      slot: e.slot,
      recipe_id: e.recipe_id,
      custom_text: e.custom_text,
      servings: e.servings,
      recipe_name: (e.recipe as unknown as { name: string } | null)?.name ?? null,
    })),
  };
}

export async function removeMealEntryInline(
  entryId: string
): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireModule("meals", "edit");
  const supabase = await createClient();
  const { error } = await supabase
    .from("meal_plan_entries")
    .delete()
    .eq("id", entryId)
    .eq("household_id", membership.household_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/meals");
  return { ok: true };
}

/** Set / clear the planned servings on a recipe entry (null = recipe default). */
export async function setMealEntryServingsInline(
  entryId: string,
  servings: number | null
): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireModule("meals", "edit");
  const clean =
    typeof servings === "number" && servings >= 1 && servings <= 50
      ? Math.round(servings)
      : null;
  const supabase = await createClient();
  const { error } = await supabase
    .from("meal_plan_entries")
    .update({ servings: clean })
    .eq("id", entryId)
    .eq("household_id", membership.household_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/meals");
  return { ok: true };
}
