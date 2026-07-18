"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import type { GroceryCat, Retailer } from "@/lib/grocery-data";

/** Manage the household's grocery category tree and retailers (mig 053). */

export async function createGroceryCategoryInline(
  name: string,
  parentId: string | null
): Promise<{ ok: boolean; error?: string; cat?: GroceryCat }> {
  const { membership } = await requireModule("shopping", "edit");
  const clean = name.trim().slice(0, 60);
  if (!clean) return { ok: false, error: "Give the category a name" };
  const supabase = await createClient();

  if (parentId) {
    const { data: parent } = await supabase
      .from("grocery_categories")
      .select("id, parent_id")
      .eq("id", parentId)
      .eq("household_id", membership.household_id)
      .maybeSingle();
    if (!parent) return { ok: false, error: "Parent category not found" };
    if (parent.parent_id) return { ok: false, error: "Only one level of sub-categories" };
  }

  const { count } = await supabase
    .from("grocery_categories")
    .select("id", { count: "exact", head: true })
    .eq("household_id", membership.household_id);
  const { data, error } = await supabase
    .from("grocery_categories")
    .insert({
      household_id: membership.household_id,
      name: clean,
      parent_id: parentId,
      position: (count ?? 0) + 1,
    })
    .select("id, name, emoji, parent_id, builtin_slug, position")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save" };
  revalidatePath("/shopping/pantry");
  return { ok: true, cat: data as GroceryCat };
}

export async function renameGroceryCategoryInline(
  id: string,
  name: string
): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireModule("shopping", "edit");
  const clean = name.trim().slice(0, 60);
  if (!clean) return { ok: false, error: "The category needs a name" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("grocery_categories")
    .update({ name: clean })
    .eq("id", id)
    .eq("household_id", membership.household_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/shopping/pantry");
  return { ok: true };
}

export async function deleteGroceryCategoryInline(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireModule("shopping", "edit");
  const supabase = await createClient();
  // sub-categories cascade; pantry items fall back to uncategorised (FK set null)
  const { error } = await supabase
    .from("grocery_categories")
    .delete()
    .eq("id", id)
    .eq("household_id", membership.household_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/shopping/pantry");
  return { ok: true };
}

export async function createRetailerInline(
  name: string
): Promise<{ ok: boolean; error?: string; retailer?: Retailer }> {
  const { membership, userId } = await requireModule("shopping", "edit");
  const clean = name.trim().slice(0, 60);
  if (!clean) return { ok: false, error: "Give the retailer a name" };
  const supabase = await createClient();
  const { count } = await supabase
    .from("retailers")
    .select("id", { count: "exact", head: true })
    .eq("household_id", membership.household_id);
  const { data, error } = await supabase
    .from("retailers")
    .insert({
      household_id: membership.household_id,
      name: clean,
      position: (count ?? 0) + 1,
      created_by: userId,
    })
    .select("id, name, position")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save" };
  revalidatePath("/shopping/pantry");
  return { ok: true, retailer: data as Retailer };
}

export async function renameRetailerInline(
  id: string,
  name: string
): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireModule("shopping", "edit");
  const clean = name.trim().slice(0, 60);
  if (!clean) return { ok: false, error: "The retailer needs a name" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("retailers")
    .update({ name: clean })
    .eq("id", id)
    .eq("household_id", membership.household_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/shopping/pantry");
  return { ok: true };
}

export async function deleteRetailerInline(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireModule("shopping", "edit");
  const supabase = await createClient();
  const { error } = await supabase
    .from("retailers")
    .delete()
    .eq("id", id)
    .eq("household_id", membership.household_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/shopping/pantry");
  return { ok: true };
}
