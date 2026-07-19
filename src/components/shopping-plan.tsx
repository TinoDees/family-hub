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
 * The Plan step — where the three streams meet and reconcile:
 *   📝 noted during the week (Kati's jot list)
 *   🧺 staples running low (min/max automation)
 *   🍽️ this week's meals (recipe ingredients)
 * One row per item regardless of how many streams want it. Simple checklist
 * by default (Needed / Suggested / To buy / Retailer); the stock columns
 * (Category / SOH / Min-Max) live behind the "stock details" toggle.
 */

export type PlanSource = "noted" | "staple" | "recipes";

export type SeedRow = {
  key: string;
  name: string;
  sources: PlanSource[];
  noteIds: string[];
  noteQty: string | null;
  neededQty: number | null; // from recipes; null = needed but unquantified
  unit: string | null;
  category: string;
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

const GROUP_META: Record<PlanSource, { title: string; hint: string }> = {
  noted: { title: "📝 Noted during the week", hint: "things someone jotted down" },
  staple: { title: "🧺 Staples running low", hint: "below their pantry minimum" },
  recipes: { title: "🍽️ For this week's meals", hint: "from the planned recipes" },
};
const SOURCE_EMOJI: Record<PlanSource, string> = { noted: "📝", staple: "🧺", recipes: "🍽️" };
const GROUP_ORDER: PlanSource[] = ["noted", "staple", "recipes"];

function primaryGroup(sources: PlanSource[]): PlanSource {
  for (const g of GROUP_ORDER) if (sources.includes(g)) return g;
  return "recipes";
}

function suggestedFor(r: {
  sources: PlanSource[];
  neededQty: number | null;
  soh: number | null;
  minQty: number | null;
  maxQty: number | null;
}): number | null {
  const round = (n: number) => Math.round(n * 100) / 100;
  if (r.sources.includes("recipes") && r.neededQty !== null) {
    if (r.soh === null) return round(r.neededQty);
    return round(Math.max(r.neededQty - r.soh, 0));
  }
  if (r.sources.includes("staple")) {
    const target = r.maxQty ?? r.minQty;
    if (target !== null) return round(Math.max(target - (r.soh ?? 0), 0));
  }
  return null; // noted / unquantified — just buy it
}

function defaultQtyText(r: SeedRow): string {
  const s = suggestedFor(r);
  if (s !== null && s > 0) return `${s}${r.unit ? ` ${r.unit}` : ""}`;
  return r.noteQty ?? "";
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
        qtyText: defaultQtyText(s),
        qtyDirty: false,
        sohText: s.soh === null ? "" : String(s.soh),
        sohDirty: false,
      };
    })
  );
  const [details, setDetails] = useState(false);
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
        next.qtyText = defaultQtyText(next);
        if (s !== null) next.include = s > 0;
      }
      return next;
    });
  }

  function addManualRow() {
    const name = newName.trim();
    if (!name) return;
    setRows((rs) => [
      ...rs,
      {
        key: `manual-${name.toLowerCase()}-${rs.length}`,
        name,
        sources: ["noted"],
        noteIds: [],
        noteQty: null,
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
    const included = rows.filter((r) => r.include);
    if (included.length === 0) {
      setError("Tick at least one item to buy");
      return;
    }
    const toBuy: PlanRowInput[] = included.map((r) => ({
      name: r.name,
      category: r.category,
      qtyText: r.qtyText,
      retailerId: r.retailerId,
      pantryItemId: r.pantryItemId,
    }));
    const sohUpdates: SohUpdate[] = rows
      .filter((r) => r.sohDirty && r.pantryItemId)
      .map((r) => ({ pantryItemId: r.pantryItemId!, soh: r.soh }));
    const usedNoteIds = included.flatMap((r) => r.noteIds);
    setBusy(true);
    setError(null);
    const res = await createShoppingRunInline(weekLabel, toBuy, sohUpdates, usedNoteIds);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not create the lists");
      return;
    }
    router.push("/shopping/lists");
    router.refresh();
  }

  const grouped = useMemo(() => {
    return GROUP_ORDER.map((g) => ({
      group: g,
      rows: rows.filter((r) => primaryGroup(r.sources) === g),
    })).filter((g) => g.rows.length > 0);
  }, [rows]);

  const includedCount = rows.filter((r) => r.include).length;
  const retailerCount = new Set(
    rows.filter((r) => r.include).map((r) => r.retailerId ?? "")
  ).size;

  const cellInput =
    "w-full rounded border border-stone-200 bg-white px-1.5 py-1 text-xs focus:border-teal-500 focus:outline-none disabled:bg-stone-50";
  const cols = details ? 9 : 6;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Here&apos;s what we think you need to buy — untick what you don&apos;t,
          adjust the <span className="text-teal-700">To buy</span> amounts, then create your lists.
        </p>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-500">
          <input
            type="checkbox"
            checked={details}
            onChange={(e) => setDetails(e.target.checked)}
            className="h-3.5 w-3.5 accent-stone-600"
          />
          Show stock details
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className={`w-full text-sm ${details ? "min-w-[56rem]" : "min-w-[38rem]"}`}>
          <thead>
            <tr className="border-b border-stone-200 bg-stone-900 text-left text-xs text-white">
              <th className="w-10 px-2 py-2.5 text-center" title="Buy it?">🛒</th>
              <th className="px-2 py-2.5 font-medium">Item</th>
              {details && <th className="w-36 px-2 py-2.5 font-medium">Category</th>}
              <th className="w-24 px-2 py-2.5 text-right font-medium" title="What this week's meals need">Needed for meals</th>
              {details && <th className="w-16 px-2 py-2.5 text-right font-medium" title="Stock on hand — remembered in the pantry">SOH</th>}
              {details && <th className="w-20 px-2 py-2.5 text-right font-medium" title="Pantry min/max target">Min/Max</th>}
              <th className="w-24 px-2 py-2.5 text-right font-medium" title="Our suggestion — overwrite in To buy">Suggested</th>
              <th className="w-24 px-2 py-2.5 font-medium">To buy</th>
              <th className="w-32 px-2 py-2.5 font-medium">Retailer</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(({ group, rows: groupRows }) => (
              <FragmentGroup key={group}>
                <tr className="border-b border-stone-100 bg-stone-50">
                  <td colSpan={cols} className="px-3 py-1.5 text-xs font-semibold text-stone-500">
                    {GROUP_META[group].title}
                    <span className="ml-2 font-normal text-stone-400">{GROUP_META[group].hint}</span>
                  </td>
                </tr>
                {groupRows.map((r) => {
                  const suggested = suggestedFor(r);
                  const extraSources = r.sources.filter((s) => s !== primaryGroup(r.sources));
                  return (
                    <tr key={r.key} className={`border-b border-stone-100 ${r.include ? "" : "opacity-40"}`}>
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
                        {extraSources.length > 0 && (
                          <span className="ml-1.5 text-xs" title={`Also: ${extraSources.join(", ")}`}>
                            {extraSources.map((s) => SOURCE_EMOJI[s]).join(" ")}
                          </span>
                        )}
                      </td>
                      {details && (
                        <td className="px-2 py-1.5">
                          <select
                            value={r.category}
                            disabled={!canEdit}
                            onChange={(e) => patch(r.key, (x) => ({ ...x, category: e.target.value }))}
                            className={cellInput}
                          >
                            {GROCERY_CATEGORIES.map((c) => (
                              <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
                            ))}
                          </select>
                        </td>
                      )}
                      <td className="px-2 py-1.5 text-right text-xs text-stone-500">
                        {!r.sources.includes("recipes")
                          ? "—"
                          : r.neededQty === null
                            ? "✓"
                            : `${r.neededQty}${r.unit ? ` ${r.unit}` : ""}`}
                      </td>
                      {details && (
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
                      )}
                      {details && (
                        <td className="px-2 py-1.5 text-right text-xs text-stone-500">
                          {r.minQty !== null || r.maxQty !== null ? `${r.minQty ?? "—"}/${r.maxQty ?? "—"}` : "—"}
                        </td>
                      )}
                      <td className="px-2 py-1.5 text-right text-xs font-medium text-stone-600">
                        {suggested === null ? "✓" : `${suggested}${r.unit ? ` ${r.unit}` : ""}`}
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={r.qtyText}
                          disabled={!canEdit}
                          onChange={(e) => patch(r.key, (x) => ({ ...x, qtyText: e.target.value, qtyDirty: true }))}
                          placeholder="—"
                          className={cellInput}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={r.retailerId ?? ""}
                          disabled={!canEdit}
                          onChange={(e) => patch(r.key, (x) => ({ ...x, retailerId: e.target.value || null }))}
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
              </FragmentGroup>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={cols} className="px-4 py-10 text-center text-sm text-stone-400">
                  Nothing to plan yet — jot down what you&apos;re running low on, plan
                  some meals, or add items below.
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
              className="rounded-lg bg-teal-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-600 disabled:opacity-50"
            >
              {busy
                ? "Creating…"
                : `🛒 Create my shopping list${retailerCount > 1 ? `s (${retailerCount})` : ""} — ${includedCount} item${includedCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Plain pass-through so grouped rows can share one key without an extra DOM node. */
function FragmentGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
