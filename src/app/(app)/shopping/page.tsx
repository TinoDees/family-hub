import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { createList, setListStatus } from "@/lib/actions/shopping";
import { inputCls, buttonCls } from "@/components/auth-card";

export default async function ShoppingPage({
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
    .select("id, name, status, created_at, shopping_list_items(count)")
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
          </div>
        </Link>
        {canEdit && (
          <form action={setListStatus}>
            <input type="hidden" name="list_id" value={l.id} />
            <input type="hidden" name="status" value={l.status === "open" ? "done" : "open"} />
            <button className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-100">
              {l.status === "open" ? "Mark done" : "Reopen"}
            </button>
          </form>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">🛒 Shopping Lists</h1>
        <Link
          href="/shopping/pantry"
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
        >
          🧺 Staples
        </Link>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {canEdit && (
        <form action={createList} className="flex items-end gap-3 rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium">New list</label>
            <input name="name" placeholder="e.g. Weekend groceries" className={inputCls} />
          </div>
          <button className={`${buttonCls} w-auto px-6`}>Create</button>
        </form>
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
