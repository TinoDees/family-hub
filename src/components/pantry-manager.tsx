"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GROCERY_CATEGORIES, CATEGORY_ORDER, categoryById, guessCategory } from "@/lib/groceries";
import {
  createPantryItemInline,
  updatePantryItemInline,
  deletePantryItemInline,
  type PantryItem,
} from "@/lib/actions/pantry";

/**
 * The staples manager. A bare name is a complete entry — category is guessed
 * live as you type (overridable), min/max/unit sit behind a per-row "target"
 * disclosure so the simple-list experience stays simple.
 */

export function PantryManager({ initial, canEdit }: { initial: PantryItem[]; canEdit: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<PantryItem[]>(initial);
  const [name, setName] = useState("");
  const [cat, setCat] = useState<string | null>(null); // null = follow the guess
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openTargets, setOpenTargets] = useState<Set<string>>(new Set());

  const guessed = name.trim() ? guessCategory(name) : "other";
  const effectiveCat = cat ?? guessed;

  const grouped = useMemo(() => {
    const by = new Map<string, PantryItem[]>();
    for (const i of items) by.set(i.category, [...(by.get(i.category) ?? []), i]);
    return CATEGORY_ORDER.filter((c) => by.has(c)).map((c) => ({
      cat: categoryById(c),
      items: (by.get(c) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [items]);

  async function add() {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    const res = await createPantryItemInline(clean, effectiveCat);
    setBusy(false);
    if (!res.ok || !res.item) {
      setError(res.error ?? "Could not save");
      return;
    }
    setItems((s) => [...s, res.item!]);
    setName("");
    setCat(null);
    router.refresh();
  }

  async function patch(id: string, p: Parameters<typeof updatePantryItemInline>[1]) {
    const prev = items;
    setItems((s) => s.map((i) => (i.id === id ? { ...i, ...p } as PantryItem : i)));
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

  const numCls =
    "w-16 rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm text-right focus:border-teal-500 focus:outline-none";

  return (
    <div className="space-y-5">
      {canEdit && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <label className="mb-1 block text-xs font-medium text-stone-500">Add a staple</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="e.g. toilet paper, milk, coffee…"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500">Category</label>
              <select
                value={effectiveCat}
                onChange={(e) => setCat(e.target.value)}
                className="rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm focus:border-teal-500 focus:outline-none"
              >
                {GROCERY_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.label}
                  </option>
                ))}
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
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-400">
          No staples yet. Add the things you always need — toilet paper, milk, coffee —
          and pull them onto any shopping list with one tap.
        </p>
      ) : (
        grouped.map(({ cat: c, items: rows }) => (
          <div key={c.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <div className="border-b border-stone-100 bg-stone-50 px-4 py-2 text-xs font-semibold text-stone-500">
              {c.emoji} {c.label}
            </div>
            <ul className="divide-y divide-stone-100">
              {rows.map((i) => {
                const targetsOpen = openTargets.has(i.id) || i.min_qty !== null || i.max_qty !== null || !!i.unit;
                return (
                  <li key={i.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="flex-1 text-sm">{i.name}</span>
                      {canEdit && (
                        <>
                          <select
                            value={i.category}
                            onChange={(e) => patch(i.id, { category: e.target.value })}
                            className="rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-xs text-stone-400 hover:border-stone-200"
                            title="Category"
                          >
                            {GROCERY_CATEGORIES.map((cc) => (
                              <option key={cc.id} value={cc.id}>
                                {cc.emoji} {cc.label}
                              </option>
                            ))}
                          </select>
                          {!targetsOpen && (
                            <button
                              type="button"
                              onClick={() => setOpenTargets((s) => new Set(s).add(i.id))}
                              className="rounded px-1.5 py-0.5 text-xs text-stone-300 hover:bg-stone-100 hover:text-stone-500"
                              title="Set a min/max target (optional)"
                            >
                              + target
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
                        <span className="text-stone-300">optional — powers suggested quantities later</span>
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
