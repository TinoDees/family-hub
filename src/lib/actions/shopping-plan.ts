"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { CATEGORY_ORDER } from "@/lib/groceries";

/**
 * The planning worksheet → shopping lists (shopping v2, S2).
 * Rows the user confirmed become ONE LIST PER RETAILER (PO-style) plus a
 * "Groceries" list for items without a retailer. Edited SOH values write back
 * to the pantry — stock knowledge decays in, no stocktake demanded.
 */

export type PlanRowInput = {
  name: string;
  category: string; // legacy slug for list grouping
  qtyText: string;
  note: string | null;
  retailerId: string | null;
  pantryItemId: string | null;
};

export type SohUpdate = { pantryItemId: string; soh: number | null };

export type UnitUpdate = { pantryItemId: string; unit: string };

export async function createShoppingRunInline(
  label: string,
  rows: PlanRowInput[],
  sohUpdates: SohUpdate[],
  usedNoteIds: string[] = [],
  unitUpdates: UnitUpdate[] = []
): Promise<{ ok: boolean; error?: string; lists?: { id: string; name: string }[] }> {
  const { membership, userId } = await requireModule("shopping", "edit");
  const supabase = await createClient();

  const cleanLabel = label.trim().slice(0, 60) || "shop";
  const cleanRows = rows
    .map((r) => ({
      name: r.name.trim().slice(0, 120),
      category: CATEGORY_ORDER.includes(r.category) ? r.category : "other",
      qtyText: r.qtyText.trim().slice(0, 40),
      note: r.note?.trim().slice(0, 120) || null,
      retailerId: r.retailerId || null,
      pantryItemId: r.pantryItemId || null,
    }))
    .filter((r) => r.name)
    .slice(0, 300);
  if (cleanRows.length === 0) return { ok: false, error: "Nothing to buy — tick at least one item" };

  // resolve retailer names (household-scoped; unknown ids fall back to Anywhere)
  const { data: retailers } = await supabase
    .from("retailers")
    .select("id, name")
    .eq("household_id", membership.household_id);
  const retailerName = new Map((retailers ?? []).map((r) => [r.id, r.name]));

  const groups = new Map<string, typeof cleanRows>();
  for (const r of cleanRows) {
    const key = r.retailerId && retailerName.has(r.retailerId) ? r.retailerId : "";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const created: { id: string; name: string }[] = [];
  for (const [key, groupRows] of groups) {
    const listName = key
      ? `${retailerName.get(key)} — ${cleanLabel}`
      : `Groceries — ${cleanLabel}`;
    const { data: list, error } = await supabase
      .from("shopping_lists")
      .insert({
        household_id: membership.household_id,
        name: listName,
        retailer_id: key || null,
        created_by: userId,
      })
      .select("id, name")
      .single();
    if (error || !list) return { ok: false, error: error?.message ?? "Could not create a list" };

    const items = groupRows.map((r, idx) => ({
      list_id: list.id,
      household_id: membership.household_id,
      position: idx,
      name: r.name,
      qty: r.qtyText || null,
      note: r.note,
      category: r.category,
    }));
    const { error: itemsError } = await supabase.from("shopping_list_items").insert(items);
    if (itemsError) return { ok: false, error: itemsError.message };
    created.push(list);
  }

  // SOH write-back to the pantry (best effort — a failure shouldn't kill the run)
  const now = new Date().toISOString();
  for (const u of sohUpdates.slice(0, 300)) {
    if (!u.pantryItemId) continue;
    const soh =
      typeof u.soh === "number" && !isNaN(u.soh) && u.soh >= 0
        ? Math.round(u.soh * 100) / 100
        : null;
    await supabase
      .from("pantry_items")
      .update({ soh, soh_updated_at: now })
      .eq("id", u.pantryItemId)
      .eq("household_id", membership.household_id);
  }

  // remember chosen units on their pantry items (first suggestion next time)
  for (const u of unitUpdates.slice(0, 300)) {
    if (!u.pantryItemId || !u.unit?.trim()) continue;
    await supabase
      .from("pantry_items")
      .update({ unit: u.unit.trim().slice(0, 20) })
      .eq("id", u.pantryItemId)
      .eq("household_id", membership.household_id);
  }

  // clear the jot-list notes that made it onto a list (Kati's loop closes)
  const noteIds = usedNoteIds.filter((id) => typeof id === "string" && id).slice(0, 300);
  if (noteIds.length > 0) {
    await supabase
      .from("shopping_notes")
      .delete()
      .in("id", noteIds)
      .eq("household_id", membership.household_id);
  }

  revalidatePath("/shopping");
  return { ok: true, lists: created };
}
