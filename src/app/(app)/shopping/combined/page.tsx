import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { CombinedList, type CombinedItem } from "@/components/combined-list";

/** The total list — every open shopping list merged into one view. */
export default async function CombinedShoppingPage() {
  const { membership, access } = await requireModule("shopping", "view");

  const supabase = await createClient();
  const { data: lists } = await supabase
    .from("shopping_lists")
    .select("id, name, retailer_id, retailer:retailers(name)")
    .eq("household_id", membership.household_id)
    .eq("status", "open");

  const listIds = (lists ?? []).map((l) => l.id);
  const { data: items } = listIds.length
    ? await supabase
        .from("shopping_list_items")
        .select("id, list_id, name, qty, note, category, checked")
        .in("list_id", listIds)
        .order("position")
    : { data: [] };

  const listById = new Map(
    (lists ?? []).map((l) => [
      l.id,
      {
        name: l.name,
        retailerName: (l.retailer as unknown as { name: string } | null)?.name ?? null,
      },
    ])
  );

  const combined: CombinedItem[] = (items ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    qty: i.qty,
    note: i.note,
    category: i.category,
    checked: i.checked,
    listId: i.list_id,
    listName: listById.get(i.list_id)?.name ?? "",
    retailerName: listById.get(i.list_id)?.retailerName ?? null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <Link href="/shopping/lists" className="text-xs text-stone-400 hover:underline">
          ← Individual lists
        </Link>
        <h2 className="text-lg font-semibold">🧾 The whole shop</h2>
      </div>
      <CombinedList items={combined} canEdit={access === "edit"} />
    </div>
  );
}
