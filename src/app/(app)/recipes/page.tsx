import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { inputCls } from "@/components/auth-card";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { membership, access } = await requireModule("recipes", "view");
  const { q } = await searchParams;

  const supabase = await createClient();
  let query = supabase
    .from("recipes")
    .select("id, name, description, servings, prep_minutes, cook_minutes, tags, hero_photo_id, hero:recipe_photos!recipes_hero_photo_id_fkey(storage_path)")
    .eq("household_id", membership.household_id)
    .order("name");
  if (q) query = query.ilike("name", `%${q}%`);
  const { data: recipes } = await query;

  const heroPaths = (recipes ?? [])
    .map((r) => (r.hero as unknown as { storage_path: string } | null)?.storage_path)
    .filter(Boolean) as string[];
  const { data: signed } = heroPaths.length
    ? await supabase.storage.from("recipe-photos").createSignedUrls(heroPaths, 3600)
    : { data: [] };
  const heroUrl = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">🍳 Recipes</h1>
        {access === "edit" && (
          <Link href="/recipes/new" className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700">
            + New recipe
          </Link>
        )}
      </div>

      <form className="max-w-sm">
        <input name="q" defaultValue={q} placeholder="Search recipes…" className={inputCls} />
      </form>

      {(recipes ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-400">
          {q ? "No recipes match your search." : "No recipes yet — add the family favourites!"}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(recipes ?? []).map((r) => (
            <Link
              key={r.id}
              href={`/recipes/${r.id}`}
              className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              {(() => {
                const path = (r.hero as unknown as { storage_path: string } | null)?.storage_path;
                const url = path ? heroUrl.get(path) : null;
                return url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={r.name} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                ) : null;
              })()}
              <div className="p-5 pt-4">
              <div className="font-medium">{r.name}</div>
              {r.description && (
                <div className="mt-1 line-clamp-2 text-sm text-stone-500">{r.description}</div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-400">
                <span>🍽 {r.servings}</span>
                {(r.prep_minutes || r.cook_minutes) && (
                  <span>⏱ {(r.prep_minutes ?? 0) + (r.cook_minutes ?? 0)} min</span>
                )}
                {r.tags.slice(0, 3).map((t: string) => (
                  <span key={t} className="rounded-full bg-stone-100 px-2 py-0.5">{t}</span>
                ))}
              </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
