"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GROCERY_CATEGORIES, categoryById, guessCategory } from "@/lib/groceries";
import type { Retailer } from "@/lib/grocery-data";
import {
  createShoppingRunInline,
  type PlanRowInput,
  type SohUpdate,
} from "@/lib/actions/shopping-plan";

/**
 * The Plan step — three streams (📝 noted / 🧺 staples / 🍽️ meals), one
 * deduped worksheet. Simple checklist by default; stock columns behind a
 * toggle; search + filters + bulk tick in the toolbar; card layout on phones.
 */

export type PlanSource = "noted" | "staple" | "recipes";

export type SeedRow = {
  key: string;
  name: string;
  sources: PlanSource[];
  noteIds: string[];
  noteQty: string | null;
  neededQty: number | null;
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
  return null;
}

function defaultQtyText(r: SeedRow): string {
  const s = suggestedFor(r);
  if (s !== null && s > 0) return `${s}${r.unit ? ` ${r.unit}` : ""}`;
  return r.noteQty ?? "";
}

const fmtQty = (q: number | null, unit: string | null) =>
  q === null ? "✓" : `${q}${unit ? ` ${unit}` : ""}`;

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
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<PlanSource | "all">("all");
  const [catFilter, setCatFilter] = useState("");
  const [retFilter, setRetFilter] = useState("");
  const [sort, setSort] = useState<"source" | "name" | "category">("source");
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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (sourceFilter !== "all" && !r.sources.includes(sourceFilter)) return false;
      if (catFilter && r.category !== catFilter) return false;
      if (retFilter === "none" ? r.retailerId !== null : retFilter && r.retailerId !== retFilter)
        return false;
      return true;
    });
    if (sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "category")
      list = [...list].sort(
        (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
      );
    return list;
  }, [rows, search, sourceFilter, catFilter, retFilter, sort]);

  const visibleKeys = useMemo(() => new Set(visible.map((r) => r.key)), [visible]);
  const setAllVisible = (include: boolean) =>
    setRows((rs) => rs.map((r) => (visibleKeys.has(r.key) ? { ...r, include } : r)));

  const grouped = useMemo(() => {
    if (sort !== "source") return [{ group: null as PlanSource | null, rows: visible }];
    return GROUP_ORDER.map((g) => ({
      group: g as PlanSource | null,
      rows: visible.filter((r) => primaryGroup(r.sources) === g),
    })).filter((g) => g.rows.length > 0);
  }, [visible, sort]);

  const sourceCounts = useMemo(() => {
    const c: Record<PlanSource, number> = { noted: 0, staple: 0, recipes: 0 };
    for (const r of rows) for (const s of r.sources) c[s]++;
    return c;
  }, [rows]);

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

  const includedCount = rows.filter((r) => r.include).length;
  const retailerCount = new Set(rows.filter((r) => r.include).map((r) => r.retailerId ?? "")).size;
  const retailerName = (id: string | null) =>
    id ? retailers.find((r) => r.id === id)?.name ?? "anywhere" : "anywhere";

  const cellInput =
    "w-full rounded border border-stone-200 bg-white px-1.5 py-1 text-xs focus:border-teal-500 focus:outline-none disabled:bg-stone-50";
  const pill = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs font-medium ${
      active
        ? "border-stone-900 bg-stone-900 text-white"
        : "border-stone-300 text-stone-500 hover:bg-stone-100"
    }`;
  const cols = details ? 9 : 6;

  const RowBadges = ({ r }: { r: Row }) => {
    const extra =
      sort === "source" ? r.sources.filter((s) => s !== primaryGroup(r.sources)) : r.sources;
    if (extra.length === 0) return null;
    return (
      <span className="ml-1.5 text-xs" title={extra.join(", ")}>
        {extra.map((s) => SOURCE_EMOJI[s]).join(" ")}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">
        Here&apos;s what we think you need to buy — untick what you don&apos;t, adjust
        the <span className="text-teal-700">To buy</span> amounts, then create your lists.
      </p>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search items…"
          className="w-40 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs focus:border-teal-500 focus:outline-none"
        />
        <div className="flex gap-1">
          <button type="button" onClick={() => setSourceFilter("all")} className={pill(sourceFilter === "all")}>
            All {rows.length}
          </button>
          {GROUP_ORDER.map((s) => (
            <button key={s} type="button" onClick={() => setSourceFilter(s)} className={pill(sourceFilter === s)}>
              {SOURCE_EMOJI[s]} {sourceCounts[s]}
            </button>
          ))}
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs focus:outline-none"
          title="Filter by category"
        >
          <option value="">All categories</option>
          {GROCERY_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
          ))}
        </select>
        <select
          value={retFilter}
          onChange={(e) => setRetFilter(e.target.value)}
          className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs focus:outline-none"
          title="Filter by retailer"
        >
          <option value="">All retailers</option>
          <option value="none">🏪 anywhere only</option>
          {retailers.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs focus:outline-none"
          title="Sort"
        >
          <option value="source">Group by source</option>
          <option value="name">Name A–Z</option>
          <option value="category">By category</option>
        </select>
        {canEdit && (
          <div className="flex gap-1">
            <button type="button" onClick={() => setAllVisible(true)} className="rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-500 hover:bg-stone-100" title="Tick every item currently shown">
              ✓ all shown
            </button>
            <button type="button" onClick={() => setAllVisible(false)} className="rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-500 hover:bg-stone-100" title="Untick every item currently shown">
              ✕ all shown
            </button>
          </div>
        )}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-stone-500">
          <input
            type="checkbox"
            checked={details}
            onChange={(e) => setDetails(e.target.checked)}
            className="h-3.5 w-3.5 accent-stone-600"
          />
          Show stock details
        </label>
      </div>

      {/* phone: cards */}
      <div className="space-y-4 md:hidden">
        {grouped.map(({ group, rows: groupRows }) => (
          <div key={group ?? "flat"} className="space-y-2">
            {group && (
              <p className="text-xs font-semibold text-stone-500">
                {GROUP_META[group].title}
                <span className="ml-2 font-normal text-stone-400">{GROUP_META[group].hint}</span>
              </p>
            )}
            {groupRows.map((r) => {
              const suggested = suggestedFor(r);
              return (
                <div
                  key={r.key}
                  className={`rounded-xl border bg-white p-3 ${r.include ? "border-stone-200" : "border-stone-100 opacity-45"}`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={r.include}
                      disabled={!canEdit}
                      onChange={(e) => patch(r.key, (x) => ({ ...x, include: e.target.checked }))}
                      className="mt-0.5 h-5 w-5 accent-teal-700"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {r.name}
                        <RowBadges r={r} />
                      </p>
                      <p className="mt-0.5 text-xs text-stone-400">
                        {r.sources.includes("recipes") && (
                          <>meals need {fmtQty(r.neededQty, r.unit)} · </>
                        )}
                        suggested {suggested === null ? "✓" : fmtQty(suggested, r.unit)}
                        {" · "}{categoryById(r.category).emoji} {categoryById(r.category).label}
                      </p>
                    </div>
                  </div>
                  {r.include && canEdit && (
                    <div className="mt-2 flex gap-2 pl-7">
                      <input
                        value={r.qtyText}
                        onChange={(e) => patch(r.key, (x) => ({ ...x, qtyText: e.target.value, qtyDirty: true }))}
                        placeholder="how much?"
                        className="w-28 rounded-lg border border-stone-200 px-2 py-1.5 text-sm focus:border-teal-500 focus:outline-none"
                      />
                      <select
                        value={r.retailerId ?? ""}
                        onChange={(e) => patch(r.key, (x) => ({ ...x, retailerId: e.target.value || null }))}
                        className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm focus:outline-none"
                      >
                        <option value="">🏪 anywhere</option>
                        {retailers.map((rt) => (
                          <option key={rt.id} value={rt.id}>{rt.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {visible.length === 0 && (
          <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-400">
            {rows.length === 0
              ? "Nothing to plan yet — jot down what you're running low on, or plan some meals."
              : "No items match the filters."}
          </p>
        )}
      </div>

      {/* desktop: table */}
      <div className="hidden overflow-x-auto rounded-xl border border-stone-200 bg-white md:block">
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
              <FragmentGroup key={group ?? "flat"}>
                {group && (
                  <tr className="border-b border-stone-100 bg-stone-50">
                    <td colSpan={cols} className="px-3 py-1.5 text-xs font-semibold text-stone-500">
                      {GROUP_META[group].title}
                      <span className="ml-2 font-normal text-stone-400">{GROUP_META[group].hint}</span>
                    </td>
                  </tr>
                )}
                {groupRows.map((r) => {
                  const suggested = suggestedFor(r);
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
                        <RowBadges r={r} />
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
                        {!r.sources.includes("recipes") ? "—" : fmtQty(r.neededQty, r.unit)}
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
                        {suggested === null ? "✓" : fmtQty(suggested, r.unit)}
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
                          title={retailerName(r.retailerId)}
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
            {visible.length === 0 && (
              <tr>
                <td colSpan={cols} className="px-4 py-10 text-center text-sm text-stone-400">
                  {rows.length === 0
                    ? "Nothing to plan yet — jot down what you're running low on, plan some meals, or add items below."
                    : "No items match the filters."}
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
            className="w-56 rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
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
