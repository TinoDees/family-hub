import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { createList, setListStatus } from "@/lib/actions/shopping";
import { inputCls } from "@/components/auth-card";
import { DeleteListButton } from "@/components/delete-list-button";

export default async function ShoppingListsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { membership, access } = await requireModule("shopping", "view");
  const { error } = await searchParams;
  const canEdit = access === "edit";

  const supabase = await createClient();
  const { data: lists } = await supabase
    .from("shopping_lists")
    .select("id, name, status, created_at, receipt_total, shopping_list_items(count)")
    .eq("household_id", membership.household_id)
    .order("created_at", { ascending: false })
    .limit(30);

  const open = (lists ?? []).filter((l) => l.status === "open");
  const done = (lists ?? []).filter((l) => l.status === "done");

  const ListRow = ({ l }: { l: NonNullable<typeof lists>[number] }) => {
    const count = (l.shopping_list_items as unknown as { count: number }[])?.[0]?.count ?? 0;
    return (
      <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3">
        <Link href={`/shopping/${l.id}`} className="min-w-0 flex-1">
          <div className={`font-medium ${l.status === "done" ? "text-stone-400 line-through" : ""}`}>{l.name}</div>
          <div className="text-xs text-stone-400">
            {count} item{count === 1 ? "" : "s"} · {new Date(l.created_at).toLocaleDateString("en-AU")}
            {l.receipt_total !== null && (
              <span className="ml-1.5 font-medium text-emerald-700">
                · 💰 ${Number(l.receipt_total).toFixed(2)}
              </span>
            )}
          </div>
        </Link>
        {canEdit && (
          <div className="flex items-center gap-1.5">
            <form action={setListStatus}>
              <input type="hidden" name="list_id" value={l.id} />
              <input type="hidden" name="status" value={l.status === "open" ? "done" : "open"} />
              <button className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-100">
                {l.status === "open" ? "Mark done" : "Reopen"}
              </button>
            </form>
            <DeleteListButton listId={l.id} listName={l.name} itemCount={count} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {open.length > 1 && (
        <Link
          href="/shopping/combined"
          className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3 hover:border-teal-300"
        >
          <span className="text-sm font-medium">
            🧾 The whole shop: all {open.length} lists in one view
          </span>
          <span className="text-xs text-teal-700">by retailer or by category →</span>
        </Link>
      )}

      {canEdit && (
        <details className="rounded-xl border border-stone-200 bg-white">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-stone-600 hover:text-stone-900">
            ＋ New empty list
            <span className="ml-2 text-xs font-normal text-stone-400">
              (tip: <Link href="/shopping/plan" className="underline">Plan</Link> builds them for you)
            </span>
          </summary>
          <form action={createList} className="flex items-center gap-2 border-t border-stone-100 px-5 py-4">
            <input
              name="name"
              required
              placeholder="List name, e.g. Weekend BBQ"
              className={`${inputCls} flex-1`}
            />
            <button className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700">
              Create
            </button>
          </form>
        </details>
      )}

      <div className="space-y-2">
        {open.length === 0 && (
          <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-400">
            No open lists. Tip: the Meal Planner can generate one from the planned week.
          </p>
        )}
        {open.map((l) => <ListRow key={l.id} l={l} />)}
      </div>

      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-stone-500">Done ({done.length})</summary>
          <div className="mt-2 space-y-2">{done.map((l) => <ListRow key={l.id} l={l} />)}</div>
        </details>
      )}
    </div>
  );
}
