import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { addItem, toggleItem, deleteItem, setListStatus, addStaplesToList } from "@/lib/actions/shopping";
import { inputCls } from "@/components/auth-card";
import { ItemCategorySelect } from "@/components/item-category-select";
import { AddMealsToList } from "@/components/add-meals-to-list";
import { CATEGORY_ORDER, categoryById } from "@/lib/groceries";

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function mondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

export default async function ShoppingListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ info?: string }>;
}) {
  const { membership, access } = await requireModule("shopping", "view");
  const { id } = await params;
  const { info } = await searchParams;
  const canEdit = access === "edit";

  const supabase = await createClient();
  const [{ data: list }, { data: items }] = await Promise.all([
    supabase
      .from("shopping_lists")
      .select("id, name, status")
      .eq("id", id)
      .eq("household_id", membership.household_id)
      .maybeSingle(),
    supabase
      .from("shopping_list_items")
      .select("id, name, qty, checked, category")
      .eq("list_id", id)
      .order("checked")
      .order("position"),
  ]);
  if (!list) notFound();

  const remaining = (items ?? []).filter((i) => !i.checked).length;

  // group by category in default walk order; uncategorised joins "other"
  type Item = NonNullable<typeof items>[number];
  const byCat = new Map<string, Item[]>();
  for (const i of items ?? []) {
    const c = i.category && CATEGORY_ORDER.includes(i.category) ? i.category : "other";
    byCat.set(c, [...(byCat.get(c) ?? []), i]);
  }
  const groups = CATEGORY_ORDER.filter((c) => byCat.has(c)).map((c) => ({
    cat: categoryById(c),
    items: byCat.get(c) ?? [],
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/shopping/lists" className="text-xs text-stone-400 hover:underline">← Lists</Link>
          <h1 className="text-2xl font-semibold">{list.name}</h1>
          <p className="text-sm text-stone-500">
            {remaining === 0 ? "All done! 🎉" : `${remaining} item${remaining === 1 ? "" : "s"} to go`}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canEdit && list.status === "open" && (
            <>
              <AddMealsToList
                listId={list.id}
                defaultFrom={iso(mondayOf(new Date()))}
                defaultTo={iso(new Date(mondayOf(new Date()).getTime() + 6 * 864e5))}
              />
              <form action={addStaplesToList}>
                <input type="hidden" name="list_id" value={list.id} />
                <button
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
                  title="Add every staple that isn't on the list yet"
                >
                  🧺 Add staples
                </button>
              </form>
            </>
          )}
          {canEdit && (
            <form action={setListStatus}>
              <input type="hidden" name="list_id" value={list.id} />
              <input type="hidden" name="status" value={list.status === "open" ? "done" : "open"} />
              <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100">
                {list.status === "open" ? "Mark done" : "Reopen"}
              </button>
            </form>
          )}
        </div>
      </div>

      {info && <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-600">{info}</p>}

      {canEdit && (
        <form action={addItem} className="flex items-end gap-2 rounded-xl border border-stone-200 bg-white p-4">
          <input type="hidden" name="list_id" value={list.id} />
          <div className="w-24">
            <label className="mb-1 block text-xs font-medium">Qty</label>
            <input name="qty" placeholder="2 kg" className={inputCls} />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium">Item</label>
            <input name="name" required placeholder="e.g. beef mince" className={inputCls} autoComplete="off" />
          </div>
          <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">Add</button>
        </form>
      )}

      {(items ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white px-4 py-10 text-center text-sm text-stone-400">
          Nothing on the list yet.
        </p>
      ) : (
        groups.map(({ cat, items: rows }) => (
          <div key={cat.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <div className="border-b border-stone-100 bg-stone-50 px-4 py-1.5 text-xs font-semibold text-stone-500">
              {cat.emoji} {cat.label}
              <span className="ml-2 font-normal text-stone-400">
                {rows.filter((i) => !i.checked).length} to go
              </span>
            </div>
            <ul className="divide-y divide-stone-100">
              {rows.map((i) => (
                <li key={i.id} className={`flex items-center gap-3 px-4 py-2.5 ${i.checked ? "bg-stone-50" : ""}`}>
                  {canEdit ? (
                    <form action={toggleItem}>
                      <input type="hidden" name="item_id" value={i.id} />
                      <input type="hidden" name="list_id" value={list.id} />
                      <input type="hidden" name="checked" value={i.checked ? "0" : "1"} />
                      <button
                        className={`flex h-6 w-6 items-center justify-center rounded-full border text-sm ${
                          i.checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-stone-300 text-transparent hover:border-stone-500"
                        }`}
                      >
                        ✓
                      </button>
                    </form>
                  ) : (
                    <span className={`h-6 w-6 rounded-full border ${i.checked ? "border-emerald-500 bg-emerald-500" : "border-stone-300"}`} />
                  )}
                  <span className={`flex-1 text-sm ${i.checked ? "text-stone-400 line-through" : ""}`}>
                    {i.qty && <span className="mr-1.5 font-medium">{i.qty}</span>}
                    {i.name}
                  </span>
                  {canEdit && (
                    <>
                      <ItemCategorySelect itemId={i.id} category={i.category && CATEGORY_ORDER.includes(i.category) ? i.category : "other"} />
                      <form action={deleteItem}>
                        <input type="hidden" name="item_id" value={i.id} />
                        <input type="hidden" name="list_id" value={list.id} />
                        <button className="text-xs text-stone-300 hover:text-red-600">✕</button>
                      </form>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
