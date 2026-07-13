import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { deleteAlbum, deletePhoto } from "@/lib/actions/photos";
import { PhotoUploader } from "@/components/photo-uploader";
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
      .select("id, name, description")
      .eq("id", id)
      .eq("household_id", membership.household_id)
      .maybeSingle(),
    supabase
      .from("photos")
      .select("id, storage_path, caption, created_at")
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
        <PhotoUploader householdId={membership.household_id} albumId={album.id} />
      )}

      {(() => {
        const receipts = (photos ?? []).filter((p) => p.caption === "Receipt");
        const normal = (photos ?? []).filter((p) => p.caption !== "Receipt");
        return (
          <>
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold">📷 Photos</h2>
              {normal.length === 0 ? (
                <p className="py-6 text-center text-sm text-stone-400">No photos yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {normal.map((p) => renderPhoto(p))}
                </div>
              )}
            </div>
            {receipts.length > 0 && (
              <details className="rounded-xl border border-stone-200 bg-white">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                  🧾 Receipts ({receipts.length})
                </summary>
                <div className="grid grid-cols-3 gap-2 border-t border-stone-100 p-4 sm:grid-cols-4 md:grid-cols-6">
                  {receipts.map((p) => renderPhoto(p))}
                </div>
              </details>
            )}
          </>
        );
      })()}
    </div>
  );

  function renderPhoto(p: { id: string; storage_path: string; caption: string | null }) {
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
                  <div className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1 text-xs text-white">
                    {p.caption}
                  </div>
                )}
                {access === "edit" && (
                  <form action={deletePhoto} className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <input type="hidden" name="photo_id" value={p.id} />
                    <input type="hidden" name="album_id" value={album!.id} />
                    <button className="rounded-full bg-black/50 px-2 py-1 text-xs text-white hover:bg-red-600" title="Delete photo">✕</button>
                  </form>
                )}
              </div>
    );
  }
}
