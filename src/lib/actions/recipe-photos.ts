"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";

export async function setHeroPhoto(formData: FormData) {
  const { membership } = await requireModule("recipes", "edit");
  const recipeId = String(formData.get("recipe_id"));
  const supabase = await createClient();
  await supabase
    .from("recipes")
    .update({ hero_photo_id: String(formData.get("photo_id")) })
    .eq("id", recipeId)
    .eq("household_id", membership.household_id);
  revalidatePath("/recipes");
  redirect(`/recipes/${recipeId}`);
}

/** first upload becomes the hero automatically */
export async function claimHeroIfEmpty(recipeId: string, photoId: string) {
  const { membership } = await requireModule("recipes", "edit");
  const supabase = await createClient();
  const { data: recipe } = await supabase
    .from("recipes")
    .select("id, hero_photo_id")
    .eq("id", recipeId)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (recipe && !recipe.hero_photo_id) {
    await supabase.from("recipes").update({ hero_photo_id: photoId }).eq("id", recipeId);
  }
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
}

export async function deleteRecipePhoto(formData: FormData) {
  const { membership } = await requireModule("recipes", "edit");
  const recipeId = String(formData.get("recipe_id"));
  const photoId = String(formData.get("photo_id"));
  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("recipe_photos")
    .select("storage_path")
    .eq("id", photoId)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (photo) {
    await supabase.storage.from("recipe-photos").remove([photo.storage_path]);
    await supabase.from("recipe_photos").delete().eq("id", photoId);
  }
  revalidatePath("/recipes");
  redirect(`/recipes/${recipeId}`);
}
