"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { guessCategory } from "@/lib/groceries";
import { ensureGroceryCategories, legacySlugFor } from "@/lib/grocery-data";

/**
 * Pantry — the household's master item catalog (mig 052 + 053). A bare name is
 * a complete entry; category/sub-category, retailer preference and min/max
 * targets are optional layers on top.
 */

export type PantryItem = {
  id: string;
  name: string;
  category_id: string | null;
  retailer_id: string | null;
  unit: string | null;
  min_qty: number | null;
  max_qty: number | null;
  soh: number | null;
};

export type PantryPatch = {
  name?: string;
  category_id?: string | null;
  retailer_id?: string | null;
  unit?: string | null;
  min_qty?: number | null;
  max_qty?: number | null;
  soh?: number | null;
};

const SELECT = "id, name, category_id, retailer_id, unit, min_qty, max_qty, soh";

function cleanQty(v: number | null | undefined): number | null {
  return typeof v === "number" && !isNaN(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
}

export async function createPantryItemInline(
  name: string,
  categoryId?: string | null
): Promise<{ ok: boolean; error?: string; item?: PantryItem }> {
  const { membership, userId } = await requireModule("shopping", "edit");
  const clean = name.trim().slice(0, 120);
  if (!clean) return { ok: false, error: "Give the item a name" };

  const supabase = await createClient();
  const cats = await ensureGroceryCategories(membership.household_id);

  // no category picked → auto-guess a builtin, resolve to this household's row
  let catId = categoryId ?? null;
  if (!catId) {
    const slug = guessCategory(clean);
    catId = cats.find((c) => c.builtin_slug === slug)?.id
      ?? cats.find((c) => c.builtin_slug === "other")?.id
      ?? null;
  } else if (!cats.some((c) => c.id === catId)) {
    return { ok: false, error: "Category not found" };
  }

  const { data: existing } = await supabase
    .from("pantry_items")
    .select("id")
    .eq("household_id", membership.household_id)
    .ilike("name", clean)
    .limit(1)
    .maybeSingle();
  if (existing) return { ok: false, error: "Already in the pantry" };

  const { data, error } = await supabase
    .from("pantry_items")
    .insert({
      household_id: membership.household_id,
      name: clean,
      category_id: catId,
      category: legacySlugFor(cats, catId), // keeps list grouping in sync
      created_by: userId,
    })
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
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const clean = patch.name.trim().slice(0, 120);
    if (!clean) return { ok: false, error: "The item needs a name" };
    update.name = clean;
  }
  if (patch.category_id !== undefined) {
    const cats = await ensureGroceryCategories(membership.household_id);
    if (patch.category_id && !cats.some((c) => c.id === patch.category_id))
      return { ok: false, error: "Category not found" };
    update.category_id = patch.category_id;
    update.category = legacySlugFor(cats, patch.category_id);
  }
  if (patch.retailer_id !== undefined) update.retailer_id = patch.retailer_id || null;
  if (patch.unit !== undefined) update.unit = patch.unit?.trim().slice(0, 20) || null;
  if (patch.min_qty !== undefined) update.min_qty = cleanQty(patch.min_qty);
  if (patch.max_qty !== undefined) update.max_qty = cleanQty(patch.max_qty);
  if (patch.soh !== undefined) {
    update.soh = cleanQty(patch.soh);
    update.soh_updated_at = new Date().toISOString();
  }
  if (
    update.min_qty !== undefined &&
    update.max_qty !== undefined &&
    update.min_qty !== null &&
    update.max_qty !== null &&
    (update.max_qty as number) < (update.min_qty as number)
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
