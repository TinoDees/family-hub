"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GROCERY_CATEGORIES, UOMS, categoryById, guessCategory } from "@/lib/groceries";
import type { Retailer } from "@/lib/grocery-data";
import { SmartSheetShell, type SheetColumn, type SegmentedFilter } from "@/components/smart-sheet-shell";
import {
  createShoppingRunInline,
  type PlanRowInput,
  type SohUpdate,
} from "@/lib/actions/shopping-plan";

/**
 * The Plan worksheet on the SmartSheetShell (ported from Tracey): dark sticky
 * header, search, filters, column picker (stock columns hidden by default),
 * sort, resize, CSV, phone card view. Four streams, one deduped sheet:
 *   📝 noted · 🧺 staples low · 🍽️ meals · 📦 the rest of the pantry catalog
 * Numbers-only To buy + predefined Unit + a per-item comment that follows the
 * item onto the list.
 */

export type PlanSource = "noted" | "staple" | "recipes" | "pantry";

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
  qtyValue: string;
  qtyUom: string;
  qtyDirty: boolean;
  sohText: string;
  sohDirty: boolean;
  comment: string;
};

const SOURCE_META: Record<PlanSource, { emoji: string; label: string; order: number }> = {
  noted: { emoji: "📝", label: "Noted", order: 0 },
  staple: { emoji: "🧺", label: "Staples low", order: 1 },
  recipes: { emoji: "🍽️", label: "Meals", order: 2 },
  pantry: { emoji: "📦", label: "Pantry catalog", order: 3 },
};
const SOURCE_ORDER: PlanSource[] = ["noted", "staple", "recipes", "pantry"];

function primaryGroup(sources: PlanSource[]): PlanSource {
  for (const g of SOURCE_ORDER) if (sources.includes(g)) return g;
  return "pantry";
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
  if (r.sources.includes("staple") || r.sources.includes("pantry")) {
    const target = r.maxQty ?? r.minQty;
    if (target !== null) return round(Math.max(target - (r.soh ?? 0), 0));
  }
  return null;
}

function normalizeUom(u: string | null): string {
  if (!u) return "";
  const lower = u.trim().toLowerCase();
  return UOMS.includes(lower) ? lower : u.trim();
}

function splitNoteQty(q: string | null): { value: string; uom: string } {
  if (!q) return { value: "", uom: "" };
  const m = q.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return { value: "", uom: normalizeUom(q) };
  return { value: m[1].replace(",", "."), uom: normalizeUom(m[2] || null) };
}

function defaultQty(r: SeedRow): { value: string; uom: string } {
  const s = suggestedFor(r);
  if (s !== null && s > 0) return { value: String(s), uom: normalizeUom(r.unit) };
  if (r.noteQty) return splitNoteQty(r.noteQty);
  return { value: "", uom: normalizeUom(r.unit) };
}

/** numbers only: digits + one decimal point */
function cleanNumeric(v: string): string {
  const s = v.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const firstDot = s.indexOf(".");
  return firstDot === -1 ? s : s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
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
      const { value, uom } = defaultQty(s);
      const pantryOnly = primaryGroup(s.sources) === "pantry";
      return {
        ...s,
        include: s.sources.includes("noted")
          ? true
          : pantryOnly
            ? false
            : suggested === null
              ? true
              : suggested > 0,
        qtyValue: value,
        qtyUom: uom,
        qtyDirty: false,
        sohText: s.soh === null ? "" : String(s.soh),
        sohDirty: false,
        comment: "",
      };
    })
  );
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewRef = useRef<Row[]>([]);

  const patch = (key: string, fn: (r: Row) => Row) =>
    setRows((rs) => rs.map((r) => (r.key === key ? fn(r) : r)));

  function setSoh(key: string, text: string) {
    const clean = cleanNumeric(text);
    patch(key, (r) => {
      const n = clean === "" ? null : parseFloat(clean);
      const soh = n !== null && !isNaN(n) && n >= 0 ? n : null;
      const next: Row = { ...r, sohText: clean, sohDirty: true, soh };
      if (!r.qtyDirty) {
        const s = suggestedFor(next);
        const dq = defaultQty(next);
        next.qtyValue = dq.value;
        next.qtyUom = dq.uom;
        if (s !== null && primaryGroup(r.sources) !== "pantry") next.include = s > 0;
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
        qtyValue: "",
        qtyUom: "",
        qtyDirty: false,
        sohText: "",
        sohDirty: false,
        comment: "",
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
      qtyText: [r.qtyValue.trim(), r.qtyUom.trim()].filter(Boolean).join(" "),
      note: r.comment.trim() || null,
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

  const setVisible = (include: boolean) => {
    const keys = new Set(viewRef.current.map((r) => r.key));
    setRows((rs) => rs.map((r) => (keys.has(r.key) ? { ...r, include } : r)));
  };

  const includedCount = rows.filter((r) => r.include).length;
  const retailerCount = new Set(rows.filter((r) => r.include).map((r) => r.retailerId ?? "")).size;

  const cellInput =
    "w-full rounded border border-stone-200 bg-white px-1.5 py-1 text-xs focus:border-teal-500 focus:outline-none disabled:bg-stone-50";

  const columns: SheetColumn<Row>[] = useMemo(() => [
    {
      key: "item", label: "Item", width: 210, sortable: true,
      sortValue: (r) => r.name.toLowerCase(),
      csv: (r) => r.name,
      render: (r) => (
        <span title={r.sources.map((s) => SOURCE_META[s].label).join(" + ")}>
          {r.name}
          {r.sources.length > 1 && (
            <span className="ml-1 text-[10px]">
              {r.sources.filter((s) => s !== primaryGroup(r.sources)).map((s) => SOURCE_META[s].emoji).join(" ")}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "buy", label: "Buy?", width: 52, align: "center",
      sortable: true, sortValue: (r) => (r.include ? 0 : 1),
      csv: (r) => (r.include ? "yes" : "no"),
      render: (r) => (
        <input
          type="checkbox"
          checked={r.include}
          disabled={!canEdit}
          onChange={(e) => patch(r.key, (x) => ({ ...x, include: e.target.checked }))}
          className="h-4 w-4 accent-teal-700"
        />
      ),
    },
    {
      key: "source", label: "Source", width: 78, align: "center",
      sortable: true, sortValue: (r) => SOURCE_META[primaryGroup(r.sources)].order,
      csv: (r) => SOURCE_META[primaryGroup(r.sources)].label,
      render: (r) => (
        <span title={SOURCE_META[primaryGroup(r.sources)].label}>
          {SOURCE_META[primaryGroup(r.sources)].emoji}
        </span>
      ),
    },
    {
      key: "needed", label: "Needed for meals", width: 110, align: "right",
      sortable: true, sortValue: (r) => r.neededQty ?? -1,
      csv: (r) => (!r.sources.includes("recipes") ? "" : r.neededQty === null ? "✓" : `${r.neededQty} ${r.unit ?? ""}`),
      render: (r) => (
        <span className="text-xs text-stone-500">
          {!r.sources.includes("recipes") ? "—" : fmtQty(r.neededQty, r.unit)}
        </span>
      ),
    },
    {
      key: "suggested", label: "Suggested", width: 92, align: "right",
      sortable: true, sortValue: (r) => suggestedFor(r) ?? -1,
      csv: (r) => { const s = suggestedFor(r); return s === null ? "" : `${s} ${r.unit ?? ""}`; },
      render: (r) => {
        const s = suggestedFor(r);
        return <span className="text-xs font-medium text-stone-600">{s === null ? "✓" : fmtQty(s, r.unit)}</span>;
      },
    },
    {
      key: "tobuy", label: "To buy", width: 78, align: "right",
      csv: (r) => r.qtyValue,
      render: (r) => (
        <input
          value={r.qtyValue}
          disabled={!canEdit}
          onChange={(e) => {
            const v = cleanNumeric(e.target.value);
            patch(r.key, (x) => ({ ...x, qtyValue: v, qtyDirty: true }));
          }}
          inputMode="decimal"
          placeholder="—"
          className={`${cellInput} text-right`}
        />
      ),
    },
    {
      key: "uom", label: "Unit", width: 88,
      csv: (r) => r.qtyUom,
      render: (r) => {
        const custom = r.qtyUom && !UOMS.includes(r.qtyUom.toLowerCase()) ? r.qtyUom : null;
        return (
          <select
            value={r.qtyUom}
            disabled={!canEdit}
            onChange={(e) => patch(r.key, (x) => ({ ...x, qtyUom: e.target.value, qtyDirty: true }))}
            className={cellInput}
          >
            <option value="">—</option>
            {custom && <option value={custom}>{custom}</option>}
            {UOMS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        );
      },
    },
    {
      key: "comment", label: "Comment", width: 160,
      csv: (r) => r.comment,
      render: (r) => (
        <input
          value={r.comment}
          disabled={!canEdit}
          onChange={(e) => patch(r.key, (x) => ({ ...x, comment: e.target.value.slice(0, 120) }))}
          placeholder="—"
          title="Goes onto the list with the item"
          className={cellInput}
        />
      ),
    },
    {
      key: "retailer", label: "Retailer", width: 120,
      sortable: true,
      sortValue: (r) => (r.retailerId ? retailers.find((x) => x.id === r.retailerId)?.name ?? "" : ""),
      csv: (r) => (r.retailerId ? retailers.find((x) => x.id === r.retailerId)?.name ?? "" : "anywhere"),
      render: (r) => (
        <select
          value={r.retailerId ?? ""}
          disabled={!canEdit}
          onChange={(e) => patch(r.key, (x) => ({ ...x, retailerId: e.target.value || null }))}
          className={cellInput}
        >
          <option value="">🏪 anywhere</option>
          {retailers.map((rt) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
        </select>
      ),
    },
    {
      key: "category", label: "Category", width: 150, defaultHidden: true,
      sortable: true, sortValue: (r) => r.category,
      csv: (r) => categoryById(r.category).label,
      render: (r) => (
        <select
          value={r.category}
          disabled={!canEdit}
          onChange={(e) => patch(r.key, (x) => ({ ...x, category: e.target.value }))}
          className={cellInput}
        >
          {GROCERY_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
        </select>
      ),
    },
    {
      key: "soh", label: "SOH", width: 70, align: "right", defaultHidden: true,
      csv: (r) => r.sohText,
      render: (r) => (
        <input
          value={r.sohText}
          disabled={!canEdit || !r.pantryItemId}
          onChange={(e) => setSoh(r.key, e.target.value)}
          inputMode="decimal"
          placeholder={r.pantryItemId ? "—" : ""}
          title={r.pantryItemId ? "Stock on hand — remembered in the pantry" : "Not in the pantry yet"}
          className={`${cellInput} text-right`}
        />
      ),
    },
    {
      key: "minmax", label: "Min/Max", width: 82, align: "right", defaultHidden: true,
      csv: (r) => (r.minQty !== null || r.maxQty !== null ? `${r.minQty ?? ""}/${r.maxQty ?? ""}` : ""),
      render: (r) => (
        <span className="text-xs text-stone-500">
          {r.minQty !== null || r.maxQty !== null ? `${r.minQty ?? "—"}/${r.maxQty ?? "—"}` : "—"}
        </span>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [canEdit, retailers]);

  const filters: SegmentedFilter<Row>[] = useMemo(() => [
    {
      id: "source", label: "Source",
      options: [
        { value: "all", label: "All sources" },
        ...SOURCE_ORDER.map((s) => ({ value: s, label: `${SOURCE_META[s].emoji} ${SOURCE_META[s].label}` })),
      ],
      match: (r, v) => r.sources.includes(v as PlanSource),
    },
    {
      id: "cat", label: "Category", multi: true,
      options: GROCERY_CATEGORIES.map((c) => ({ value: c.id, label: `${c.emoji} ${c.label}` })),
      match: (r, v) => r.category === v,
    },
    {
      id: "ret", label: "Retailer", multi: true,
      options: [
        { value: "__none", label: "🏪 anywhere" },
        ...retailers.map((r) => ({ value: r.id, label: r.name })),
      ],
      match: (r, v) => (v === "__none" ? r.retailerId === null : r.retailerId === v),
    },
    {
      id: "buy", label: "Buy?",
      options: [
        { value: "all", label: "All" },
        { value: "yes", label: "Ticked" },
        { value: "no", label: "Unticked" },
      ],
      match: (r, v) => (v === "yes" ? r.include : !r.include),
    },
  ], [retailers]);

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">
        Here&apos;s what we think you need to buy — untick what you don&apos;t, adjust{" "}
        <span className="text-teal-700">To buy</span>, then create your lists.{" "}
        <span className="font-normal text-stone-400">
          📝 noted · 🧺 staples low · 🍽️ meals · 📦 pantry catalog (unticked — tick what you need)
        </span>
      </p>

      <SmartSheetShell<Row>
        rows={rows}
        columns={columns}
        getRowId={(r) => r.key}
        storageKey="nestly-plan.v1"
        searchText={(r) => r.name}
        searchPlaceholder="Search items…"
        filters={filters}
        initialSort={[{ k: "source", dir: "asc" }, { k: "item", dir: "asc" }]}
        csvFilename="shopping-plan"
        rowStyle={(r) => (!r.include ? { opacity: 0.45 } : undefined)}
        onView={(v) => { viewRef.current = v; }}
        maxHeight="65vh"
        rightToolbar={
          canEdit ? (
            <span className="inline-flex gap-1">
              <button type="button" onClick={() => setVisible(true)} className="rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-500 hover:bg-stone-100" title="Tick every item currently shown">
                ✓ shown
              </button>
              <button type="button" onClick={() => setVisible(false)} className="rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-500 hover:bg-stone-100" title="Untick every item currently shown">
                ✕ shown
              </button>
            </span>
          ) : undefined
        }
      />

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
