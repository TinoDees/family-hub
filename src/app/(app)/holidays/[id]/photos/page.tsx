import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { createTripAlbum } from "@/lib/actions/trips";
import { deletePhoto } from "@/lib/actions/photos";
import { PhotoUploader } from "@/components/photo-uploader";
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
          {canEdit && <PhotoUploader householdId={membership.household_id} albumId={album.id} showVisibility />}
          {(() => {
            const receipts = (photos ?? []).filter((p) => p.caption === "Receipt");
            const normal = (photos ?? []).filter((p) => p.caption !== "Receipt");
            const card = (p: { id: string; storage_path: string; caption: string | null }) => {
                const url = urlFor.get(p.storage_path);
                return (
                  <div key={p.id} className="group relative overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={p.caption ?? ""} className="aspect-square w-full object-cover" loading="lazy" />
                      </a>
                    ) : (
                      <div className="flex aspect-square items-center justify-center text-stone-300">📷</div>
                    )}
                    {p.caption && (
                      <div className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1 text-xs text-white">{p.caption}</div>
                    )}
                    {canEdit && (
                      <form action={deletePhoto} className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <input type="hidden" name="photo_id" value={p.id} />
                        <input type="hidden" name="album_id" value={album.id} />
                        <button className="rounded-full bg-black/50 px-2 py-1 text-xs text-white hover:bg-red-600">✕</button>
                      </form>
                    )}
                  </div>
                );
            };
            return (
              <>
                <div className="rounded-xl border border-stone-200 bg-white p-4">
                  <h2 className="mb-3 text-sm font-semibold">📷 Photos</h2>
                  {normal.length === 0 ? (
                    <p className="py-6 text-center text-sm text-stone-400">No photos yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {normal.map(card)}
                    </div>
                  )}
                </div>
                {receipts.length > 0 && (
                  <details className="rounded-xl border border-stone-200 bg-white">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                      🧾 Receipts ({receipts.length})
                    </summary>
                    <div className="grid grid-cols-3 gap-2 border-t border-stone-100 p-4 sm:grid-cols-4 md:grid-cols-6">
                      {receipts.map(card)}
                    </div>
                  </details>
                )}
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}
