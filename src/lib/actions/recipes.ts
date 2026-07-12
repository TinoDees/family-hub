"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";

export type IngredientInput = {
  name: string;
  qty?: number | null;
  unit?: string | null;
  note?: string | null;
};

function parseIngredients(raw: string): IngredientInput[] {
  try {
    const arr = JSON.parse(raw) as IngredientInput[];
    return arr
      .filter((i) => i.name?.trim())
      .map((i) => ({
        name: i.name.trim().slice(0, 200),
        qty: typeof i.qty === "number" && !isNaN(i.qty) ? i.qty : null,
        unit: i.unit?.trim().slice(0, 30) || null,
        note: i.note?.trim().slice(0, 200) || null,
      }));
  } catch {
    return [];
  }
}

function recipeFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    servings: parseInt(String(formData.get("servings") ?? "4")) || 4,
    prep_minutes: parseInt(String(formData.get("prep_minutes") ?? "")) || null,
    cook_minutes: parseInt(String(formData.get("cook_minutes") ?? "")) || null,
    instructions: String(formData.get("instructions") ?? "").trim() || null,
    tags: String(formData.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 12),
  };
}

async function saveIngredients(
  recipeId: string,
  householdId: string,
  ingredients: IngredientInput[]
) {
  const supabase = await createClient();
  await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
  if (ingredients.length > 0) {
    await supabase.from("recipe_ingredients").insert(
      ingredients.map((i, idx) => ({
        recipe_id: recipeId,
        household_id: householdId,
        position: idx,
        ...i,
      }))
    );
  }
}

export async function createRecipe(formData: FormData) {
  const { membership, userId } = await requireModule("recipes", "edit");
  const fields = recipeFields(formData);
  if (!fields.name) redirect("/recipes/new?error=Recipe+needs+a+name");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .insert({ ...fields, household_id: membership.household_id, created_by: userId })
    .select("id")
    .single();
  if (error || !data)
    redirect(`/recipes/new?error=${encodeURIComponent(error?.message ?? "Could not save")}`);

  await saveIngredients(data.id, membership.household_id, parseIngredients(String(formData.get("ingredients_json") ?? "[]")));
  revalidatePath("/recipes");
  redirect(`/recipes/${data.id}`);
}

export async function updateRecipe(formData: FormData) {
  const { membership } = await requireModule("recipes", "edit");
  const id = String(formData.get("recipe_id"));
  const fields = recipeFields(formData);
  if (!fields.name) redirect(`/recipes/${id}/edit?error=Recipe+needs+a+name`);

  const supabase = await createClient();
  const { error } = await supabase
    .from("recipes")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("household_id", membership.household_id);
  if (error) redirect(`/recipes/${id}/edit?error=${encodeURIComponent(error.message)}`);

  await saveIngredients(id, membership.household_id, parseIngredients(String(formData.get("ingredients_json") ?? "[]")));
  revalidatePath("/recipes");
  redirect(`/recipes/${id}`);
}

export async function deleteRecipe(formData: FormData) {
  const { membership } = await requireModule("recipes", "edit");
  const supabase = await createClient();
  await supabase
    .from("recipes")
    .delete()
    .eq("id", String(formData.get("recipe_id")))
    .eq("household_id", membership.household_id);
  revalidatePath("/recipes");
  redirect("/recipes");
}
