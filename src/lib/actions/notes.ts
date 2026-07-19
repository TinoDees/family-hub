"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";

/** The running-low jot list (mig 054) — two-second quick adds during the week. */

export type ShoppingNote = {
  id: string;
  name: string;
  qty: string | null;
  created_at: string;
};

export async function createNoteInline(
  name: string,
  qty?: string
): Promise<{ ok: boolean; error?: string; note?: ShoppingNote }> {
  const { membership, userId } = await requireModule("shopping", "edit");
  const clean = name.trim().slice(0, 120);
  if (!clean) return { ok: false, error: "Type what you're running low on" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shopping_notes")
    .insert({
      household_id: membership.household_id,
      name: clean,
      qty: qty?.trim().slice(0, 40) || null,
      created_by: userId,
    })
    .select("id, name, qty, created_at")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save" };
  revalidatePath("/shopping");
  return { ok: true, note: data as ShoppingNote };
}

export async function deleteNoteInline(
  noteId: string
): Promise<{ ok: boolean; error?: string }> {
  const { membership } = await requireModule("shopping", "edit");
  const supabase = await createClient();
  const { error } = await supabase
    .from("shopping_notes")
    .delete()
    .eq("id", noteId)
    .eq("household_id", membership.household_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/shopping");
  return { ok: true };
}
