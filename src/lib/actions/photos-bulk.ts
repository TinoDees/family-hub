"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function bulkDeletePhotos(
  photoIds: string[]
): Promise<{ ok: boolean; deleted: number; error?: string }> {
  if (photoIds.length === 0) return { ok: true, deleted: 0 };
  const supabase = await createClient();
  // RLS: only rows the caller may delete come back
  const { data: photos } = await supabase
    .from("photos")
    .select("id, storage_path")
    .in("id", photoIds.slice(0, 200));
  if (!photos || photos.length === 0) return { ok: false, deleted: 0, error: "Nothing deletable found" };

  await supabase.storage.from("photos").remove(photos.map((p) => p.storage_path));
  const { error } = await supabase
    .from("photos")
    .delete()
    .in("id", photos.map((p) => p.id));
  if (error) return { ok: false, deleted: 0, error: error.message };
  revalidatePath("/photos");
  return { ok: true, deleted: photos.length };
}

export async function updatePhotoCaptions(
  photoIds: string[],
  caption: string
): Promise<{ ok: boolean; error?: string }> {
  if (photoIds.length === 0) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase
    .from("photos")
    .update({ caption: caption.trim().slice(0, 300) || null })
    .in("id", photoIds.slice(0, 200));
  if (error) return { ok: false, error: error.message };
  revalidatePath("/photos");
  return { ok: true };
}

export async function setAlbumHero(photoId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("photos")
    .select("id, album_id")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return { ok: false, error: "Photo not found" };
  const { error } = await supabase
    .from("albums")
    .update({ hero_photo_id: photo.id })
    .eq("id", photo.album_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/photos");
  return { ok: true };
}

export async function updatePhotoSection(
  photoIds: string[],
  section: string
): Promise<{ ok: boolean; error?: string }> {
  if (photoIds.length === 0) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase
    .from("photos")
    .update({ section: section.trim().slice(0, 100) || null })
    .in("id", photoIds.slice(0, 200));
  if (error) return { ok: false, error: error.message };
  revalidatePath("/photos");
  return { ok: true };
}
