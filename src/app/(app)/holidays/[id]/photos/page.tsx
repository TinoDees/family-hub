import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { createTripAlbum } from "@/lib/actions/trips";
import { PhotoUploader } from "@/components/photo-uploader";
import { PhotoGallery } from "@/components/photo-gallery";
import { TripTabs } from "@/components/trip-tabs";

export default async function TripPhotosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { membership, access } = await requireModule("holidays", "view");
  const { id } = await params;
  const canEdit = access === "edit";

  const supabase = await createClient();
  const [{ data: trip }, { data: album }] = await Promise.all([
    supabase
      .from("trips")
      .select("id, name")
      .eq("id", id)
      .eq("household_id", membership.household_id)
      .maybeSingle(),
    supabase.from("albums").select("id, name").eq("trip_id", id).maybeSingle(),
  ]);
  if (!trip) notFound();

  const { data: photos } = album
    ? await supabase
        .from("photos")
        .select("id, storage_path, caption")
        .eq("album_id", album.id)
        .order("created_at", { ascending: false })
    : { data: [] };

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
      <div>
        <Link href={`/holidays/${trip.id}`} className="text-xs text-stone-400 hover:underline">← {trip.name}</Link>
        <h1 className="text-2xl font-semibold">📷 Trip photos</h1>
      </div>
      <TripTabs tripId={trip.id} />

      {!album ? (
        canEdit ? (
          <form action={createTripAlbum} className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center">
            <input type="hidden" name="trip_id" value={trip.id} />
            <p className="text-sm text-stone-500">No album for this trip yet.</p>
            <button className="mt-3 rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700">
              Create trip album
            </button>
          </form>
        ) : (
          <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-400">
            No album for this trip yet.
          </p>
        )
      ) : (
        <>
          <p className="text-xs text-stone-400">
            This album also appears in the{" "}
            <Link href="/photos" className="underline">Photo Album</Link> module.
          </p>
          {canEdit && (
            <PhotoUploader householdId={membership.household_id} albumId={album.id} showVisibility />
          )}
          <PhotoGallery
            canEdit={canEdit}
            photos={(photos ?? []).map((p) => ({
              id: p.id,
              url: urlFor.get(p.storage_path) ?? null,
              caption: p.caption,
              isReceipt: p.caption === "Receipt",
            }))}
          />
        </>
      )}
    </div>
  );
}
