"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";

export async function createAlbum(formData: FormData) {
  const { membership, userId } = await requireModule("photos", "edit");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/photos?error=Album+needs+a+name");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("albums")
    .insert({
      household_id: membership.household_id,
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !data)
    redirect(`/photos?error=${encodeURIComponent(error?.message ?? "Could not create album")}`);
  redirect(`/photos/${data.id}`);
}

export async function deleteAlbum(formData: FormData) {
  const { membership } = await requireModule("photos", "edit");
  const albumId = String(formData.get("album_id"));

  const supabase = await createClient();
  const { data: photos } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("album_id", albumId)
    .eq("household_id", membership.household_id);

  if (photos && photos.length > 0) {
    await supabase.storage.from("photos").remove(photos.map((p) => p.storage_path));
  }
  await supabase
    .from("albums")
    .delete()
    .eq("id", albumId)
    .eq("household_id", membership.household_id);

  revalidatePath("/photos");
  redirect("/photos");
}

export async function deletePhoto(formData: FormData) {
  const { membership } = await requireModule("photos", "edit");
  const photoId = String(formData.get("photo_id"));
  const albumId = String(formData.get("album_id"));

  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("id", photoId)
    .eq("household_id", membership.household_id)
    .maybeSingle();
  if (photo) {
    await supabase.storage.from("photos").remove([photo.storage_path]);
    await supabase.from("photos").delete().eq("id", photoId);
  }
  revalidatePath(`/photos/${albumId}`);
  redirect(`/photos/${albumId}`);
}

export async function setCaption(formData: FormData) {
  const { membership } = await requireModule("photos", "edit");
  const supabase = await createClient();
  await supabase
    .from("photos")
    .update({ caption: String(formData.get("caption") ?? "").trim() || null })
    .eq("id", String(formData.get("photo_id")))
    .eq("household_id", membership.household_id);
  revalidatePath(`/photos/${formData.get("album_id")}`);
  redirect(`/photos/${formData.get("album_id")}`);
}
