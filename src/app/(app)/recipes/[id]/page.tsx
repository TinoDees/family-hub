import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { deleteRecipe } from "@/lib/actions/recipes";
import { ConfirmSubmit } from "@/components/confirm-submit";

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { membership, access } = await requireModule("recipes", "view");
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: recipe }, { data: ingredients }] = await Promise.all([
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
  ]);
  if (!recipe) notFound();

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
          </div>
        </div>
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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1.5fr]">
        <div className="rounded-xl border border-stone-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold">Ingredients</h2>
          {(ingredients ?? []).length === 0 ? (
            <p className="text-sm text-stone-400">None listed.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {(ingredients ?? []).map((i) => (
                <li key={i.id} className="flex gap-2">
                  <span className="min-w-16 text-right font-medium text-stone-600">
                    {i.qty ? `${Number(i.qty)}${i.unit ? ` ${i.unit}` : ""}` : ""}
                  </span>
                  <span>
                    {i.name}
                    {i.note && <span className="text-stone-400"> ({i.note})</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold">Method</h2>
          {recipe.instructions ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
              {recipe.instructions}
            </div>
          ) : (
            <p className="text-sm text-stone-400">No method written down yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
