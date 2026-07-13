import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { createAlbum } from "@/lib/actions/photos";
import { inputCls, buttonCls } from "@/components/auth-card";

export default async function PhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { membership, access } = await requireModule("photos", "view");
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: albums } = await supabase
    .from("albums")
    .select("id, name, description, created_at, hero_photo_id, hero:photos!albums_hero_photo_id_fkey(storage_path), photos(count)")
    .eq("household_id", membership.household_id)
    .order("created_at", { ascending: false });

  // cover images: first photo per album
  const { data: covers } = await supabase
    .from("photos")
    .select("album_id, storage_path")
    .eq("household_id", membership.household_id)
    .order("created_at", { ascending: true });
  const coverPath = new Map<string, string>();
  for (const a of albums ?? []) {
    const heroPath = (a.hero as unknown as { storage_path: string } | null)?.storage_path;
    if (heroPath) coverPath.set(a.id, heroPath);
  }
  for (const p of covers ?? []) {
    if (!coverPath.has(p.album_id)) coverPath.set(p.album_id, p.storage_path);
  }
  const paths = [...coverPath.values()];
  const signed = paths.length
    ? (await supabase.storage.from("photos").createSignedUrls(paths, 3600)).data
    : [];
  const coverUrl = new Map<string, string>();
  for (const [albumId, path] of coverPath) {
    const s = (signed ?? []).find((x) => x.path === path);
    if (s?.signedUrl) coverUrl.set(albumId, s.signedUrl);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">📷 Photo Album</h1>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {access === "edit" && (
        <form action={createAlbum} className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-5">
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-sm font-medium">New album</label>
            <input name="name" required placeholder="e.g. Gold Coast 2026" className={inputCls} />
          </div>
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-sm font-medium">Description (optional)</label>
            <input name="description" placeholder="Family holiday" className={inputCls} />
          </div>
          <button className={`${buttonCls} w-auto px-6`}>Create</button>
        </form>
      )}

      {(albums ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-400">
          No albums yet — create one and add the first photos.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {(albums ?? []).map((a) => {
            const count = (a.photos as unknown as { count: number }[])?.[0]?.count ?? 0;
            const cover = coverUrl.get(a.id);
            return (
              <Link
                key={a.id}
                href={`/photos/${a.id}`}
                className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="aspect-[4/3] bg-stone-100">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt={a.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl text-stone-300">📷</div>
                  )}
                </div>
                <div className="p-3">
                  <div className="truncate text-sm font-medium">{a.name}</div>
                  <div className="text-xs text-stone-400">
                    {count} photo{count === 1 ? "" : "s"}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
