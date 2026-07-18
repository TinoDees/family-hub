"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GROCERY_CATEGORIES, guessCategory } from "@/lib/groceries";
import type { Retailer } from "@/lib/grocery-data";
import {
  createShoppingRunInline,
  type PlanRowInput,
  type SohUpdate,
} from "@/lib/actions/shopping-plan";

/**
 * The planning worksheet — the step between the meal planner and the lists.
 * Every column is auto-filled; everything is overridable; untouched + Create
 * gives the simple one-tap outcome (the Kati rule). "Create" makes one list
 * per retailer plus a Groceries list for retailer-less items.
 */

export type SeedRow = {
  key: string;
  name: string;
  source: "recipes" | "staple";
  neededQty: number | null; // null = needed but unquantified
  unit: string | null;
  category: string; // legacy slug
  pantryItemId: string | null;
  soh: number | null;
  minQty: number | null;
  maxQty: number | null;
  retailerId: string | null;
};

type Row = SeedRow & {
  include: boolean;
  qtyText: string;
  qtyDirty: boolean;
  sohText: string;
  sohDirty: boolean;
};

function suggestedFor(r: {
  source: "recipes" | "staple";
  neededQty: number | null;
  soh: number | null;
  minQty: number | null;
  maxQty: number | null;
}): number | null {
  const round = (n: number) => Math.round(n * 100) / 100;
  if (r.source === "staple") {
    const target = r.maxQty ?? r.minQty;
    if (target === null) return null;
    return round(Math.max(target - (r.soh ?? 0), 0));
  }
  if (r.neededQty === null) return null; // needed, just unquantified
  if (r.soh === null) return round(r.neededQty);
  return round(Math.max(r.neededQty - r.soh, 0));
}

function defaultQtyText(suggested: number | null, unit: string | null): string {
  if (suggested === null || suggested === 0) return "";
  return `${suggested}${unit ? ` ${unit}` : ""}`;
}

export function ShoppingPlan({
  seed,
  retailers,
  weekLabel,
  canEdit,
}: {
  seed: SeedRow[];
  retailers: Retailer[];
  weekLabel: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    seed.map((s) => {
      const suggested = suggestedFor(s);
      return {
        ...s,
        include: suggested === null ? true : suggested > 0,
        qtyText: defaultQtyText(suggested, s.unit),
        qtyDirty: false,
        sohText: s.soh === null ? "" : String(s.soh),
        sohDirty: false,
      };
    })
  );
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (key: string, fn: (r: Row) => Row) =>
    setRows((rs) => rs.map((r) => (r.key === key ? fn(r) : r)));

  function setSoh(key: string, text: string) {
    patch(key, (r) => {
      const n = text.trim() === "" ? null : parseFloat(text);
      const soh = n !== null && !isNaN(n) && n >= 0 ? n : null;
      const next: Row = { ...r, sohText: text, sohDirty: true, soh };
      if (!r.qtyDirty) {
        const s = suggestedFor(next);
        next.qtyText = defaultQtyText(s, r.unit);
        next.include = s === null ? r.include : s > 0;
      }
      return next;
    });
  }

  function addManualRow() {
    const name = newName.trim();
    if (!name) return;
    const key = `manual-${name.toLowerCase()}-${rows.length}`;
    setRows((rs) => [
      ...rs,
      {
        key,
        name,
        source: "recipes",
        neededQty: null,
        unit: null,
        category: guessCategory(name),
        pantryItemId: null,
        soh: null,
        minQty: null,
        maxQty: null,
        retailerId: null,
        include: true,
        qtyText: "",
        qtyDirty: false,
        sohText: "",
        sohDirty: false,
      },
    ]);
    setNewName("");
  }

  async function create() {
    if (busy) return;
    const toBuy: PlanRowInput[] = rows
      .filter((r) => r.include)
      .map((r) => ({
        name: r.name,
        category: r.category,
        qtyText: r.qtyText,
        retailerId: r.retailerId,
        pantryItemId: r.pantryItemId,
      }));
    if (toBuy.length === 0) {
      setError("Tick at least one item to buy");
      return;
    }
    const sohUpdates: SohUpdate[] = rows
      .filter((r) => r.sohDirty && r.pantryItemId)
      .map((r) => ({ pantryItemId: r.pantryItemId!, soh: r.soh }));
    setBusy(true);
    setError(null);
    const res = await createShoppingRunInline(weekLabel, toBuy, sohUpdates);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not create the lists");
      return;
    }
    router.push("/shopping/lists");
    router.refresh();
  }

  const includedCount = rows.filter((r) => r.include).length;
  const retailerCount = new Set(
    rows.filter((r) => r.include).map((r) => r.retailerId ?? "")
  ).size;

  const catLabel = useMemo(
    () => new Map(GROCERY_CATEGORIES.map((c) => [c.id, `${c.emoji} ${c.label}`])),
    []
  );

  const cellInput =
    "w-full rounded border border-stone-200 bg-white px-1.5 py-1 text-xs focus:border-teal-500 focus:outline-none disabled:bg-stone-50";

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-900 text-left text-xs text-white">
              <th className="w-10 px-2 py-2.5 text-center" title="Buy it?">🛒</th>
              <th className="px-2 py-2.5 font-medium">Item</th>
              <th className="w-36 px-2 py-2.5 font-medium">Category</th>
              <th className="w-20 px-2 py-2.5 text-right font-medium" title="From the week's recipes">Needed</th>
              <th className="w-16 px-2 py-2.5 text-right font-medium" title="Stock on hand — optional, remembered in the pantry">SOH</th>
              <th className="w-20 px-2 py-2.5 text-right font-medium" title="Pantry min/max target">Min/Max</th>
              <th className="w-20 px-2 py-2.5 text-right font-medium">Suggested</th>
              <th className="w-24 px-2 py-2.5 font-medium">To buy</th>
              <th className="w-32 px-2 py-2.5 font-medium">Retailer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const suggested = suggestedFor(r);
              return (
                <tr
                  key={r.key}
                  className={`border-b border-stone-100 ${r.include ? "" : "opacity-45"}`}
                >
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={r.include}
                      disabled={!canEdit}
                      onChange={(e) => patch(r.key, (x) => ({ ...x, include: e.target.checked }))}
                      className="h-4 w-4 accent-teal-700"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    {r.name}
                    {r.source === "staple" && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800" title="Below its pantry minimum">
                        staple
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={r.category}
                      disabled={!canEdit}
                      onChange={(e) => patch(r.key, (x) => ({ ...x, category: e.target.value }))}
                      className={cellInput}
                    >
                      {GROCERY_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>{catLabel.get(c.id)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-right text-xs text-stone-500">
                    {r.source === "staple"
                      ? "—"
                      : r.neededQty === null
                        ? "✓"
                        : `${r.neededQty}${r.unit ? ` ${r.unit}` : ""}`}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={r.sohText}
                      disabled={!canEdit || !r.pantryItemId}
                      onChange={(e) => setSoh(r.key, e.target.value)}
                      inputMode="decimal"
                      placeholder={r.pantryItemId ? "—" : ""}
                      title={r.pantryItemId ? "Stock on hand (remembered in the pantry)" : "Not in the pantry yet"}
                      className={`${cellInput} text-right`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right text-xs text-stone-500">
                    {r.minQty !== null || r.maxQty !== null
                      ? `${r.minQty ?? "—"}/${r.maxQty ?? "—"}`
                      : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right text-xs font-medium text-stone-600">
                    {suggested === null ? (r.source === "staple" ? "—" : "✓") : `${suggested}${r.unit ? ` ${r.unit}` : ""}`}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={r.qtyText}
                      disabled={!canEdit}
                      onChange={(e) =>
                        patch(r.key, (x) => ({ ...x, qtyText: e.target.value, qtyDirty: true }))
                      }
                      placeholder="—"
                      className={cellInput}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={r.retailerId ?? ""}
                      disabled={!canEdit}
                      onChange={(e) =>
                        patch(r.key, (x) => ({ ...x, retailerId: e.target.value || null }))
                      }
                      className={cellInput}
                    >
                      <option value="">🏪 anywhere</option>
                      {retailers.map((rt) => (
                        <option key={rt.id} value={rt.id}>{rt.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-stone-400">
                  Nothing to plan yet — plan some meals for the week, or add items below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addManualRow()}
            placeholder="Add another item…"
            className="w-64 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={addManualRow}
            disabled={!newName.trim()}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 disabled:opacity-40"
          >
            Add
          </button>
          <div className="ml-auto flex items-center gap-3">
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="button"
              onClick={create}
              disabled={busy || includedCount === 0}
              className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
            >
              {busy
                ? "Creating…"
                : `🛒 Create ${retailerCount > 1 ? `${retailerCount} lists` : "shopping list"} (${includedCount} item${includedCount === 1 ? "" : "s"})`}
            </button>
          </div>
        </div>
      )}
      <p className="text-xs text-stone-400">
        Everything is pre-filled — you can hit Create without touching a thing. SOH you
        enter here is remembered in the pantry for next time. Items with a retailer get
        their own list per retailer; the rest land on a Groceries list.
      </p>
    </div>
  );
}
