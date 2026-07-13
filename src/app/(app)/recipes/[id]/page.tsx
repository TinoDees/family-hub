import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { deleteRecipe } from "@/lib/actions/recipes";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { RecipeScaler } from "@/components/recipe-scaler";
import { RecipePhotoUploader } from "@/components/recipe-photo-uploader";
import { CookMode } from "@/components/cook-mode";
import { setHeroPhoto, deleteRecipePhoto } from "@/lib/actions/recipe-photos";

function MethodSteps({ instructions }: { instructions: string }) {
  const lines = instructions.split("\n").map((l) => l.trim()).filter(Boolean);
  const steps: string[] = [];
  for (const line of lines) {
    const m = line.match(/^(\d+)[.)]\s*(.*)$/);
    if (m) steps.push(m[2]);
    else if (steps.length > 0) steps[steps.length - 1] += ` ${line}`;
    else steps.push(line);
  }
  if (steps.length <= 1) {
    return <div className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">{instructions}</div>;
  }
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-semibold text-white">
            {i + 1}
          </span>
          <span className="text-sm leading-relaxed text-stone-700">{step}</span>
        </li>
      ))}
    </ol>
  );
}

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { membership, access } = await requireModule("recipes", "view");
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: recipe }, { data: ingredients }, { data: photos }] = await Promise.all([
    supabase
      .from("recipes")
      .select("*")
      .eq("id", id)
      .eq("household_id", membership.household_id)
      .maybeSingle(),
    supabase
      .from("recipe_ingredients")
      .select("id, name, qty, unit, note")
      .eq("recipe_id", id)
      .order("position"),
    supabase
      .from("recipe_photos")
      .select("id, storage_path")
      .eq("recipe_id", id)
      .order("created_at"),
  ]);
  if (!recipe) notFound();

  const photoUrls = new Map<string, string>();
  if ((photos ?? []).length > 0) {
    const { data: signed } = await supabase.storage
      .from("recipe-photos")
      .createSignedUrls((photos ?? []).map((p) => p.storage_path), 3600);
    for (const p of photos ?? []) {
      const s = (signed ?? []).find((x) => x.path === p.storage_path);
      if (s?.signedUrl) photoUrls.set(p.id, s.signedUrl);
    }
  }

  let videoUrl: string | null = null;
  if (recipe.video_path) {
    const { data } = await supabase.storage
      .from("recipe-videos")
      .createSignedUrl(recipe.video_path, 3600);
    videoUrl = data?.signedUrl ?? null;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/recipes" className="text-xs text-stone-400 hover:underline">← Recipes</Link>
          <h1 className="text-2xl font-semibold">{recipe.name}</h1>
          {recipe.description && <p className="mt-1 text-sm text-stone-500">{recipe.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-400">
            <span>🍽 serves {recipe.servings}</span>
            {recipe.prep_minutes && <span>prep {recipe.prep_minutes} min</span>}
            {recipe.cook_minutes && <span>cook {recipe.cook_minutes} min</span>}
            {recipe.tags.map((t: string) => (
              <span key={t} className="rounded-full bg-stone-100 px-2 py-0.5">{t}</span>
            ))}
            {recipe.source_url && (
              <a href={recipe.source_url} target="_blank" rel="noreferrer" className="text-sky-600 underline">
                original source ↗
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CookMode />
          {access === "edit" && (
          <div className="flex items-center gap-2">
            <Link href={`/recipes/${recipe.id}/edit`} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100">
              Edit
            </Link>
            <form action={deleteRecipe}>
              <input type="hidden" name="recipe_id" value={recipe.id} />
              <ConfirmSubmit
                label="Delete"
                confirmMessage={`Delete "${recipe.name}"? It will also disappear from any meal plans.`}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              />
            </form>
          </div>
          )}
        </div>
      </div>

      {((photos ?? []).length > 0 || access === "edit") && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Photos</h2>
            {access === "edit" && (
              <RecipePhotoUploader householdId={membership.household_id} recipeId={recipe.id} />
            )}
          </div>
          {(photos ?? []).length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {(photos ?? []).map((p) => {
                const url = photoUrls.get(p.id);
                const isHero = recipe.hero_photo_id === p.id;
                return (
                  <div key={p.id} className={`group relative overflow-hidden rounded-lg border ${isHero ? "border-amber-400 ring-2 ring-amber-200" : "border-stone-200"}`}>
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                      </a>
                    ) : (
                      <div className="flex aspect-square items-center justify-center text-stone-300">📷</div>
                    )}
                    {isHero && (
                      <span className="absolute left-1 top-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        hero
                      </span>
                    )}
                    {access === "edit" && (
                      <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition-opacity group-hover:opacity-100">
                        {!isHero ? (
                          <form action={setHeroPhoto}>
                            <input type="hidden" name="recipe_id" value={recipe.id} />
                            <input type="hidden" name="photo_id" value={p.id} />
                            <button className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white hover:bg-amber-500">★ hero</button>
                          </form>
                        ) : <span />}
                        <form action={deleteRecipePhoto}>
                          <input type="hidden" name="recipe_id" value={recipe.id} />
                          <input type="hidden" name="photo_id" value={p.id} />
                          <button className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white hover:bg-red-600">✕</button>
                        </form>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {videoUrl && (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-black">
          <video src={videoUrl} controls playsInline preload="metadata" className="mx-auto max-h-96 w-full" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1.5fr]">
        <div className="rounded-xl border border-stone-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold">Ingredients</h2>
          {(ingredients ?? []).length === 0 ? (
            <p className="text-sm text-stone-400">None listed.</p>
          ) : (
            <RecipeScaler
              baseServings={recipe.servings}
              ingredients={(ingredients ?? []).map((i) => ({
                id: i.id,
                name: i.name,
                qty: i.qty !== null ? Number(i.qty) : null,
                unit: i.unit,
                note: i.note,
              }))}
            />
          )}
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold">Method</h2>
          {recipe.instructions ? (
            <MethodSteps instructions={recipe.instructions} />
          ) : (
            <p className="text-sm text-stone-400">No method written down yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
