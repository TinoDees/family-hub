"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CATEGORY_ORDER, categoryById } from "@/lib/groceries";
import { toggleItemInline } from "@/lib/actions/shopping";

/**
 * The combined view — every open list merged into one total list, with a
 * toggle between "by retailer" (each store's run, categories inside) and
 * "by category" (one walk through the shop, retailer chips on the items).
 * Checking off here updates the underlying per-retailer list too.
 */

export type CombinedItem = {
  id: string;
  name: string;
  qty: string | null;
  note: string | null;
  category: string | null;
  checked: boolean;
  listId: string;
  listName: string;
  retailerName: string | null;
};

type GroupMode = "retailer" | "category";

export function CombinedList({
  items: initial,
  canEdit,
  activeVisitId = null,
}: {
  items: CombinedItem[];
  canEdit: boolean;
  activeVisitId?: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState<CombinedItem[]>(initial);
  const [mode, setMode] = useState<GroupMode>("retailer");
  const [hideDone, setHideDone] = useState(false);

  async function toggle(id: string, checked: boolean) {
    const prev = items;
    setItems((s) => s.map((i) => (i.id === id ? { ...i, checked } : i)));
    const res = await toggleItemInline(id, checked, activeVisitId);
    if (!res.ok) setItems(prev);
    else router.refresh();
  }

  const shown = hideDone ? items.filter((i) => !i.checked) : items;

  const catKey = (c: string | null) =>
    c && CATEGORY_ORDER.includes(c) ? c : "other";
  const byCategoryOrder = (a: CombinedItem, b: CombinedItem) =>
    CATEGORY_ORDER.indexOf(catKey(a.category)) - CATEGORY_ORDER.indexOf(catKey(b.category)) ||
    a.name.localeCompare(b.name);

  const groups = useMemo(() => {
    if (mode === "retailer") {
      const by = new Map<string, CombinedItem[]>();
      for (const i of shown) {
        const k = i.retailerName ?? "🏪 Anywhere";
        by.set(k, [...(by.get(k) ?? []), i]);
      }
      return [...by.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, rows]) => ({
          label,
          rows: [...rows].sort(byCategoryOrder),
          sub: (i: CombinedItem) => `${categoryById(catKey(i.category)).emoji}`,
        }));
    }
    const by = new Map<string, CombinedItem[]>();
    for (const i of shown) {
      const k = catKey(i.category);
      by.set(k, [...(by.get(k) ?? []), i]);
    }
    return CATEGORY_ORDER.filter((c) => by.has(c)).map((c) => ({
      label: `${categoryById(c).emoji} ${categoryById(c).label}`,
      rows: (by.get(c) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      sub: (i: CombinedItem) => i.retailerName ?? "anywhere",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, mode]);

  const remaining = items.filter((i) => !i.checked).length;
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-medium ${
      active
        ? "border-teal-700 bg-teal-700 text-white"
        : "border-stone-300 text-stone-600 hover:bg-stone-100"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-500">
          Everything on your open lists in one place —{" "}
          {remaining === 0 ? "all done! 🎉" : `${remaining} item${remaining === 1 ? "" : "s"} to go`}.
          Ticking here ticks the store list too.
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMode("retailer")} className={pill(mode === "retailer")}>
            🏪 By retailer
          </button>
          <button type="button" onClick={() => setMode("category")} className={pill(mode === "category")}>
            🥕 By category
          </button>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-500">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
              className="h-3.5 w-3.5 accent-stone-600"
            />
            hide done
          </label>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-400">
          No open lists — <Link href="/shopping/plan" className="underline">plan the shop</Link> to create some.
        </p>
      ) : (
        groups.map((g) => {
          const left = g.rows.filter((i) => !i.checked).length;
          return (
            <div key={g.label} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-2">
                <span className="text-sm font-semibold">{g.label}</span>
                <span className="text-xs text-stone-400">
                  {left === 0 ? "done ✓" : `${left} to go`}
                </span>
              </div>
              <ul className="divide-y divide-stone-100">
                {g.rows.map((i) => (
                  <li key={i.id} className={`flex items-center gap-3 px-4 py-2.5 ${i.checked ? "bg-stone-50" : ""}`}>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => toggle(i.id, !i.checked)}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm ${
                          i.checked
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-stone-300 text-transparent hover:border-stone-500"
                        }`}
                      >
                        ✓
                      </button>
                    ) : (
                      <span className={`h-6 w-6 shrink-0 rounded-full border ${i.checked ? "border-emerald-500 bg-emerald-500" : "border-stone-300"}`} />
                    )}
                    <span className={`min-w-0 flex-1 text-sm ${i.checked ? "text-stone-400 line-through" : ""}`}>
                      {i.qty && <span className="mr-1.5 font-medium">{i.qty}</span>}
                      {i.name}
                      {i.note && <span className="ml-1.5 text-xs italic text-stone-400">— {i.note}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-stone-400" title={i.listName}>
                      {g.sub(i)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </div>
  );
}
