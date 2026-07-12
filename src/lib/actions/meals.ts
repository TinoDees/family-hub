"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";

export async function addMealEntry(formData: FormData) {
  const { membership, userId } = await requireModule("meals", "edit");
  const w = String(formData.get("w") ?? "");
  const recipeId = String(formData.get("recipe_id") || "");
  const customText = String(formData.get("custom_text") ?? "").trim();
  if (!recipeId && !customText) redirect(`/meals?w=${w}`);

  const supabase = await createClient();
  await supabase.from("meal_plan_entries").insert({
    household_id: membership.household_id,
    entry_date: String(formData.get("entry_date")),
    slot: String(formData.get("slot") ?? "dinner"),
    recipe_id: recipeId || null,
    custom_text: recipeId ? null : customText || null,
    created_by: userId,
  });
  revalidatePath("/meals");
  redirect(`/meals?w=${w}`);
}

export async function removeMealEntry(formData: FormData) {
  const { membership } = await requireModule("meals", "edit");
  const supabase = await createClient();
  await supabase
    .from("meal_plan_entries")
    .delete()
    .eq("id", String(formData.get("entry_id")))
    .eq("household_id", membership.household_id);
  revalidatePath("/meals");
  redirect(`/meals?w=${formData.get("w") ?? ""}`);
}
