"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { GroceryCat, Retailer } from "@/lib/grocery-data";
import { guessCategory } from "@/lib/groceries";
import {
  createPantryItemInline,
  updatePantryItemInline,
  deletePantryItemInline,
  type PantryItem,
} from "@/lib/actions/pantry";
import { GroceryAdmin } from "@/components/grocery-admin";

/**
 * The pantry — master item catalog. A bare name is a complete entry; category
 * is guessed live (overridable, tree select), retailer preference and min/max
 * targets are optional layers behind "+ target".
 */

export function PantryManager({
  initial,
  categories,
  retailers,
  canEdit,
}: {
  initial: PantryItem[];
  categories: GroceryCat[];
  retailers: Retailer[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<PantryItem[]>(initial);
  const [name, setName] = useState("");
  const [catChoice, setCatChoice] = useState<string | "">(""); // "" = follow the guess
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openTargets, setOpenTargets] = useState<Set<string>>(new Set());
  const [showAdmin, setShowAdmin] = useState(false);

  const tops = useMemo(
    () => categories.filter((c) => !c.parent_id),
    [categories]
  );
  const childrenOf = useMemo(() => {
    const m = new Map<string, GroceryCat[]>();
    for (const c of categories) {
      if (c.parent_id) m.set(c.parent_id, [...(m.get(c.parent_id) ?? []), c]);
    }
    return m;
  }, [categories]);

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const topOf = (categoryId: string | null): GroceryCat | null => {
    if (!categoryId) return null;
    const c = byId.get(categoryId);
    if (!c) return null;
    return c.parent_id ? byId.get(c.parent_id) ?? c : c;
  };

  const guessedId = useMemo(() => {
    if (!name.trim()) return "";
    const slug = guessCategory(name);
    return categories.find((c) => c.builtin_slug === slug)?.id
      ?? categories.find((c) => c.builtin_slug === "other")?.id
      ?? "";
  }, [name, categories]);
  const effectiveCat = catChoice || guessedId;

  const grouped = useMemo(() => {
    const by = new Map<string, PantryItem[]>();
    for (const i of items) {
      const top = topOf(i.category_id);
      const key = top?.id ?? "uncat";
      by.set(key, [...(by.get(key) ?? []), i]);
    }
    const order = [...tops.map((t) => t.id), "uncat"];
    return order
      .filter((k) => by.has(k))
      .map((k) => ({
        top: k === "uncat" ? null : byId.get(k) ?? null,
        items: (by.get(k) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, tops, byId]);

  async function add() {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    const res = await createPantryItemInline(clean, effectiveCat || null);
    setBusy(false);
    if (!res.ok || !res.item) {
      setError(res.error ?? "Could not save");
      return;
    }
    setItems((s) => [...s, res.item!]);
    setName("");
    setCatChoice("");
    router.refresh();
  }

  async function patch(id: string, p: Parameters<typeof updatePantryItemInline>[1]) {
    const prev = items;
    setItems((s) => s.map((i) => (i.id === id ? ({ ...i, ...p } as PantryItem) : i)));
    const res = await updatePantryItemInline(id, p);
    if (!res.ok) {
      setItems(prev);
      setError(res.error ?? "Could not save");
      return;
    }
    setError(null);
    router.refresh();
  }

  async function remove(id: string) {
    const prev = items;
    setItems((s) => s.filter((i) => i.id !== id));
    const res = await deletePantryItemInline(id);
    if (!res.ok) {
      setItems(prev);
      setError(res.error ?? "Could not remove");
      return;
    }
    router.refresh();
  }

  const CatOptions = () => (
    <>
      {tops.map((t) => {
        const kids = childrenOf.get(t.id) ?? [];
        return kids.length > 0 ? (
          <optgroup key={t.id} label={`${t.emoji ?? ""} ${t.name}`.trim()}>
            <option value={t.id}>{t.emoji ?? ""} {t.name}</option>
            {kids.map((k) => (
              <option key={k.id} value={k.id}>&nbsp;&nbsp;↳ {k.name}</option>
            ))}
          </optgroup>
        ) : (
          <option key={t.id} value={t.id}>{t.emoji ?? ""} {t.name}</option>
        );
      })}
    </>
  );

  const numCls =
    "w-16 rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm text-right focus:border-teal-500 focus:outline-none";

  return (
    <div className="space-y-5">
      {canEdit && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <label className="mb-1 block text-xs font-medium text-stone-500">Add an item</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="e.g. toilet paper, beef mince, coffee…"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500">Category</label>
              <select
                value={effectiveCat}
                onChange={(e) => setCatChoice(e.target.value)}
                className="rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm focus:border-teal-500 focus:outline-none"
              >
                <option value="">— auto —</option>
                <CatOptions />
              </select>
            </div>
            <button
              type="button"
              onClick={add}
              disabled={busy || !name.trim()}
              className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowAdmin((v) => !v)}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-100"
            >
              ⚙️ Categories & retailers
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}

      {canEdit && showAdmin && (
        <GroceryAdmin categories={categories} retailers={retailers} />
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-400">
          The pantry is your household&apos;s master item list — staples, ingredients,
          anything you buy. Add items here (or let shopping build it up over time) and
          set categories, retailer preferences and min/max targets as much or as little
          as you like.
        </p>
      ) : (
        grouped.map(({ top, items: rows }) => (
          <div key={top?.id ?? "uncat"} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <div className="border-b border-stone-100 bg-stone-50 px-4 py-2 text-xs font-semibold text-stone-500">
              {top ? `${top.emoji ?? ""} ${top.name}`.trim() : "Uncategorised"}
            </div>
            <ul className="divide-y divide-stone-100">
              {rows.map((i) => {
                const targetsOpen =
                  openTargets.has(i.id) ||
                  i.min_qty !== null ||
                  i.max_qty !== null ||
                  i.soh !== null ||
                  !!i.unit;
                const cat = i.category_id ? byId.get(i.category_id) : null;
                return (
                  <li key={i.id} className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-32 flex-1 text-sm">
                        {i.name}
                        {cat?.parent_id && (
                          <span className="ml-1.5 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">
                            {cat.name}
                          </span>
                        )}
                        {i.soh !== null && (
                          <span
                            className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] ${
                              i.min_qty !== null && i.soh < i.min_qty
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-50 text-emerald-700"
                            }`}
                            title="Stock on hand"
                          >
                            {i.soh}{i.unit ? ` ${i.unit}` : ""} in stock
                          </span>
                        )}
                      </span>
                      {canEdit && (
                        <>
                          <select
                            value={i.category_id ?? ""}
                            onChange={(e) => patch(i.id, { category_id: e.target.value || null })}
                            className="max-w-36 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-xs text-stone-400 hover:border-stone-200"
                            title="Category"
                          >
                            <option value="">— none —</option>
                            <CatOptions />
                          </select>
                          <select
                            value={i.retailer_id ?? ""}
                            onChange={(e) => patch(i.id, { retailer_id: e.target.value || null })}
                            className="max-w-32 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-xs text-stone-400 hover:border-stone-200"
                            title="Preferred retailer"
                          >
                            <option value="">🏪 anywhere</option>
                            {retailers.map((r) => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                          {!targetsOpen && (
                            <button
                              type="button"
                              onClick={() => setOpenTargets((s) => new Set(s).add(i.id))}
                              className="rounded px-1.5 py-0.5 text-xs text-stone-300 hover:bg-stone-100 hover:text-stone-500"
                              title="Track stock and set a min/max target (optional)"
                            >
                              + stock
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => remove(i.id)}
                            className="text-xs text-stone-300 hover:text-red-600"
                            title="Remove"
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                    {canEdit && targetsOpen && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                        <span title="Stock on hand — how many you have right now">in stock</span>
                        <input
                          defaultValue={i.soh ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            patch(i.id, { soh: v === "" ? null : parseFloat(v) });
                          }}
                          inputMode="decimal"
                          className={numCls}
                          placeholder="—"
                        />
                        <span>min</span>
                        <input
                          defaultValue={i.min_qty ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            patch(i.id, { min_qty: v === "" ? null : parseFloat(v) });
                          }}
                          inputMode="decimal"
                          className={numCls}
                          placeholder="—"
                        />
                        <span>max</span>
                        <input
                          defaultValue={i.max_qty ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            patch(i.id, { max_qty: v === "" ? null : parseFloat(v) });
                          }}
                          inputMode="decimal"
                          className={numCls}
                          placeholder="—"
                        />
                        <span>unit</span>
                        <input
                          defaultValue={i.unit ?? ""}
                          onBlur={(e) => patch(i.id, { unit: e.target.value })}
                          className="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm focus:border-teal-500 focus:outline-none"
                          placeholder="rolls, L…"
                        />
                        <span className="text-stone-300">optional — stock + min/max power the suggested order quantities</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
