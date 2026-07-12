import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { updateRecipe } from "@/lib/actions/recipes";
import { RecipeForm } from "@/components/recipe-form";

export default async function EditRecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { membership } = await requireModule("recipes", "edit");
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const [{ data: recipe }, { data: ingredients }] = await Promise.all([
    supabase.from("recipes").select("*").eq("id", id).eq("household_id", membership.household_id).maybeSingle(),
    supabase.from("recipe_ingredients").select("name, qty, unit, note").eq("recipe_id", id).order("position"),
  ]);
  if (!recipe) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/recipes/${id}`} className="text-xs text-stone-400 hover:underline">← {recipe.name}</Link>
        <h1 className="text-2xl font-semibold">Edit recipe</h1>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <RecipeForm
        action={updateRecipe}
        submitLabel="Save changes"
        recipe={{
          id: recipe.id,
          name: recipe.name,
          description: recipe.description,
          servings: recipe.servings,
          prep_minutes: recipe.prep_minutes,
          cook_minutes: recipe.cook_minutes,
          instructions: recipe.instructions,
          tags: recipe.tags,
          ingredients: (ingredients ?? []).map((i) => ({
            name: i.name,
            qty: i.qty !== null ? String(Number(i.qty)) : "",
            unit: i.unit ?? "",
            note: i.note ?? "",
          })),
        }}
      />
    </div>
  );
}
