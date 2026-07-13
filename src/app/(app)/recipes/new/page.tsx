import Link from "next/link";
import { requireModule } from "@/lib/module-guard";
import { NewRecipeClient } from "@/components/new-recipe-client";

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireModule("recipes", "edit");
  const { error } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/recipes" className="text-xs text-stone-400 hover:underline">← Recipes</Link>
        <h1 className="text-2xl font-semibold">New recipe</h1>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <NewRecipeClient />
    </div>
  );
}
