"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { CATEGORY_ORDER, guessCategory } from "@/lib/groceries";

/**
 * Pantry staples (mig 052) — inline actions for the pantry manager grid.
 * A bare name is a complete entry; min/max/unit are optional extras.
 */

export type PantryItem = {
  id: string;
  name: string;
  category: string;
  unit: string | null;
  min_qty: number | null;
  max_qty: number | null;
};

export type PantryPatch = {
  name?: string;
  category?: string;
  unit?: string | null;
  min_qty?: number | null;
  max_qty?: number | null;
};

const SELECT = "id, name, category, unit, min_qty, max_qty";

function cleanQty(v: number | null | undefined): number | null {
  return typeof v === "number" && !isNaN(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
}

export async function createPantryItemInline(
  name: string,
  category?: string
): Promise<{ ok: boolean; error?: string; item?: PantryItem }> {
  const { membership, userId } = await requireModule("shopping", "edit");
  const clean = name.trim().slice(0, 120);
  if (!clean) return { ok: false, error: "Give the staple a name" };
  const cat = category && CATEGORY_ORDER.includes(category) ? category : guessCategory(clean);

  const supabase = await createClient();
  // soft dedupe — same name already in the pantry
  const { data: existing } = await supabase
    .from("pantry_items")
    .select("id")
    .eq("household_id", membership.household_id)
    .ilike("name", clean)
    .limit(1)
    .maybeSingle();
  if (existing) return { ok: false, error: "Already in your staples" };

  const { data, error } = await supabase
    .from("pantry_items")
    .insert({ household_id: membership.household_id, name: clean, category: cat, created_by: userId })
    .select(SELECT)
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save" };
  revalidatePath("/shopping/pantry");
  return { ok: true, item: data as PantryItem };
}

export async function updatePantryItemInline(
  itemId: string,
  patch: PantryPatch
): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireModule("shopping", "edit");
  const update: PantryPatch = {};
  if (patch.name !== undefined) {
    const clean = patch.name.trim().slice(0, 120);
    if (!clean) return { ok: false, error: "The staple needs a name" };
    update.name = clean;
  }
  if (patch.category !== undefined)
    update.category = CATEGORY_ORDER.includes(patch.category ?? "") ? patch.category : "other";
  if (patch.unit !== undefined) update.unit = patch.unit?.trim().slice(0, 20) || null;
  if (patch.min_qty !== undefined) update.min_qty = cleanQty(patch.min_qty);
  if (patch.max_qty !== undefined) update.max_qty = cleanQty(patch.max_qty);
  if (
    update.min_qty !== undefined &&
    update.max_qty !== undefined &&
    update.min_qty !== null &&
    update.max_qty !== null &&
    update.max_qty < update.min_qty
  )
    return { ok: false, error: "Max can't be below min" };
  if (Object.keys(update).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("pantry_items")
    .update(update)
    .eq("id", itemId)
    .eq("household_id", membership.household_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/shopping/pantry");
  return { ok: true };
}

export async function deletePantryItemInline(
  itemId: string
): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireModule("shopping", "edit");
  const supabase = await createClient();
  const { error } = await supabase
    .from("pantry_items")
    .delete()
    .eq("id", itemId)
    .eq("household_id", membership.household_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/shopping/pantry");
  return { ok: true };
}
