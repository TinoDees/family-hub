import Link from "next/link";
import { requireModule } from "@/lib/module-guard";
import { NewRecipeClient } from "@/components/new-recipe-client";

export const maxDuration = 150;

function extractUrl(...candidates: (string | undefined)[]): string | undefined {
  for (const c of candidates) {
    const m = c?.match(/https?:\/\/\S+/);
    if (m) return m[0];
  }
  return undefined;
}

export default async function ShareRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; text?: string; title?: string }>;
}) {
  const { membership } = await requireModule("recipes", "edit");
  const { url, text, title } = await searchParams;
  const shared = extractUrl(url, text, title);

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="flex items-center gap-2 border-b border-stone-200 bg-white px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="Nestly" className="h-8 w-8 rounded-lg" />
        <div className="text-sm font-semibold">Nestly — save a recipe</div>
        <Link href="/recipes" className="ml-auto text-sm text-stone-500 underline">
          Recipes
        </Link>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
        {!shared && (
          <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
            Share a recipe page to Nestly, or paste the link below.
          </p>
        )}
        <NewRecipeClient householdId={membership.household_id} initialUrl={shared} />
      </main>
    </div>
  );
}
