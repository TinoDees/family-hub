import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { deleteAlbum } from "@/lib/actions/photos";
import { PhotoUploader } from "@/components/photo-uploader";
import { PhotoGallery } from "@/components/photo-gallery";
import { ConfirmSubmit } from "@/components/confirm-submit";

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { membership, access } = await requireModule("photos", "view");
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: album }, { data: photos }] = await Promise.all([
    supabase
      .from("albums")
      .select("id, name, description, trip_id, hero_photo_id")
      .eq("id", id)
      .eq("household_id", membership.household_id)
      .maybeSingle(),
    supabase
      .from("photos")
      .select("id, storage_path, caption, section, section_date")
      .eq("album_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!album) notFound();

  const signed = (photos ?? []).length
    ? (
        await supabase.storage
          .from("photos")
          .createSignedUrls((photos ?? []).map((p) => p.storage_path), 3600)
      ).data
    : [];
  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/photos" className="text-xs text-stone-400 hover:underline">← Albums</Link>
          <h1 className="text-2xl font-semibold">{album.name}</h1>
          {album.description && <p className="text-sm text-stone-500">{album.description}</p>}
        </div>
        {access === "edit" && (
          <form action={deleteAlbum}>
            <input type="hidden" name="album_id" value={album.id} />
            <ConfirmSubmit
              label="Delete album"
              confirmMessage={`Delete "${album.name}" and all its photos? This cannot be undone.`}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            />
          </form>
        )}
      </div>

      {access === "edit" && (
        <PhotoUploader
          householdId={membership.household_id}
          albumId={album.id}
          showVisibility={Boolean(album.trip_id)}
        />
      )}

      <PhotoGallery
        canEdit={access === "edit"}
        heroPhotoId={album.hero_photo_id}
        photos={(photos ?? []).map((p) => ({
          id: p.id,
          url: urlFor.get(p.storage_path) ?? null,
          caption: p.caption,
          section: p.section,
          section_date: p.section_date,
          isReceipt: p.caption === "Receipt",
        }))}
      />
    </div>
  );
}
