import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { addItem, toggleItem, deleteItem, setListStatus } from "@/lib/actions/shopping";
import { inputCls } from "@/components/auth-card";

export default async function ShoppingListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { membership, access } = await requireModule("shopping", "view");
  const { id } = await params;
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
      .select("id, name, qty, checked")
      .eq("list_id", id)
      .order("checked")
      .order("position"),
  ]);
  if (!list) notFound();

  const remaining = (items ?? []).filter((i) => !i.checked).length;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/shopping" className="text-xs text-stone-400 hover:underline">← Lists</Link>
          <h1 className="text-2xl font-semibold">{list.name}</h1>
          <p className="text-sm text-stone-500">
            {remaining === 0 ? "All done! 🎉" : `${remaining} item${remaining === 1 ? "" : "s"} to go`}
          </p>
        </div>
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

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        {(items ?? []).length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-stone-400">Nothing on the list yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {(items ?? []).map((i) => (
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
                  <form action={deleteItem}>
                    <input type="hidden" name="item_id" value={i.id} />
                    <input type="hidden" name="list_id" value={list.id} />
                    <button className="text-xs text-stone-300 hover:text-red-600">✕</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
