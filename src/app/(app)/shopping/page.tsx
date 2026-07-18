import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";

/** The shopping dashboard — overview of lists, pantry and the week's plan. */
export default async function ShoppingOverviewPage() {
  const { membership } = await requireModule("shopping", "view");

  const supabase = await createClient();
  const [{ data: openLists }, { count: pantryCount }, { count: retailerCount }] =
    await Promise.all([
      supabase
        .from("shopping_lists")
        .select("id, name, created_at, shopping_list_items(count)")
        .eq("household_id", membership.household_id)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("pantry_items")
        .select("id", { count: "exact", head: true })
        .eq("household_id", membership.household_id),
      supabase
        .from("retailers")
        .select("id", { count: "exact", head: true })
        .eq("household_id", membership.household_id),
    ]);

  const cards = [
    {
      href: "/shopping/plan",
      emoji: "🧮",
      title: "Plan the shop",
      text: "The week's recipe ingredients plus low staples in one worksheet — check stock, adjust quantities, split per retailer, create the lists.",
    },
    {
      href: "/shopping/lists",
      emoji: "📝",
      title: "Lists",
      text:
        (openLists?.length ?? 0) === 0
          ? "No open lists right now."
          : `${openLists!.length} open list${openLists!.length === 1 ? "" : "s"}.`,
    },
    {
      href: "/shopping/pantry",
      emoji: "🧺",
      title: "Pantry",
      text: `${pantryCount ?? 0} item${(pantryCount ?? 0) === 1 ? "" : "s"} in the master catalog · ${retailerCount ?? 0} retailer${(retailerCount ?? 0) === 1 ? "" : "s"} set up.`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href + c.title}
            href={c.href}
            className="rounded-xl border border-stone-200 bg-white p-4 transition hover:border-stone-300 hover:shadow-sm"
          >
            <div className="text-xl">{c.emoji}</div>
            <div className="mt-1 font-medium">{c.title}</div>
            <p className="mt-1 text-xs text-stone-500">{c.text}</p>
          </Link>
        ))}
      </div>

      {(openLists?.length ?? 0) > 0 && (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <div className="border-b border-stone-100 bg-stone-50 px-4 py-2 text-xs font-semibold text-stone-500">
            Open lists
          </div>
          <ul className="divide-y divide-stone-100">
            {openLists!.map((l) => {
              const count =
                (l.shopping_list_items as unknown as { count: number }[])?.[0]?.count ?? 0;
              return (
                <li key={l.id}>
                  <Link
                    href={`/shopping/${l.id}`}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-stone-50"
                  >
                    <span className="text-sm font-medium">{l.name}</span>
                    <span className="text-xs text-stone-400">
                      {count} item{count === 1 ? "" : "s"} ·{" "}
                      {new Date(l.created_at).toLocaleDateString("en-AU")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(pantryCount ?? 0) === 0 && (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-400">
          Tip: start the <Link href="/shopping/pantry" className="underline hover:text-stone-600">pantry</Link> with
          a handful of staples — the things you always need — and pull them onto any list
          with one tap.
        </p>
      )}
    </div>
  );
}
