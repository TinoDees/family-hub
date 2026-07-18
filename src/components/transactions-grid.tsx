"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  assignCategoryInline,
  deleteTransactionInline,
  confirmCategoryInline,
  confirmAllInline,
} from "@/lib/actions/finance";
import {
  suggestCategories,
  acceptSuggestion,
  dismissSuggestion,
  acceptAllSuggestions,
} from "@/lib/actions/classify";
import { findTransfersInline, setTransferInline } from "@/lib/actions/transfers";
import { setScopeInline } from "@/lib/actions/scope";
import { ruleMatches } from "@/lib/rules";
import { NewRuleModal } from "@/components/rules-grid";
import { NewCategoryModal } from "@/components/category-modal";

type Row = {
  id: string;
  posted_at: string;
  description: string;
  merchant: string | null;
  amount: number;
  category_id: string | null;
  suggested_category_id: string | null;
  source: string;
  is_transfer: boolean;
  scope: "household" | "personal";
  account_id: string | null;
  /** 'pending' = bank hasn't settled it yet (mig 046); absent/'posted' = final */
  status?: string | null;
  /** mig 050: a person confirmed the category. Rule-applied rows are false until ticked. */
  reviewed: boolean;
};
type Cat = { id: string; name: string; icon: string | null; kind: string };
type Acc = { id: string; name: string };
type SortKey = "date" | "desc" | "account" | "category" | "amount";
type SortDir = "asc" | "desc";

type ColDef = {
  key: SortKey | "actions";
  label: string;
  /** Default width in px. Undefined = flex (takes the remaining space). */
  width?: number;
  minWidth: number;
  align: "left" | "right";
  sortable: boolean;
  /** Can be dragged to a new position. The actions column stays pinned last. */
  movable: boolean;
};

const STATUS_OPTIONS = [
  { value: "unsorted", label: "To sort" },
  { value: "toconfirm", label: "🪄 To confirm" },
  { value: "sorted", label: "✓ Sorted" },
  { value: "transfer", label: "Transfers" },
  { value: "personal", label: "👤 Personal" },
];

/** Sorting state of one row: unsorted → (toconfirm) → sorted; transfers live apart. */
function rowStatus(r: Row): "transfer" | "unsorted" | "toconfirm" | "sorted" {
  if (r.is_transfer) return "transfer";
  if (!r.category_id) return "unsorted";
  return r.reviewed ? "sorted" : "toconfirm";
}

// ── MultiSelectFilter — compact checkbox popover for toolbar filters ─────────

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  searchable = false,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const needle = q.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;

  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`rounded-lg border px-2.5 py-1.5 text-sm ${
          selected.size > 0
            ? "border-teal-400 bg-teal-50 font-medium text-teal-800"
            : "border-stone-300 bg-white text-stone-700"
        } hover:bg-stone-50`}
      >
        {label}
        {selected.size > 0 ? ` (${selected.size})` : ""} <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
          {searchable && (
            <div className="border-b border-stone-100 p-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Type to filter…"
                autoFocus
                className="w-full rounded-lg border border-stone-300 px-2 py-1 text-xs outline-none focus:border-stone-500"
              />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {shown.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-stone-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(o.value)}
                  onChange={() => toggle(o.value)}
                  className="h-3.5 w-3.5 accent-teal-600"
                />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
            {shown.length === 0 && <p className="px-3 py-2 text-xs text-stone-400">No matches</p>}
          </div>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="block w-full border-t border-stone-100 px-3 py-2 text-left text-xs font-medium text-teal-700 hover:bg-teal-50"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function TransactionsGrid({
  rows,
  categories,
  accounts,
  canEdit,
  currency,
  monthKey,
  statusPill = false,
  hideAccountColumn = false,
  storageKey = "txns",
  removeWhenSorted = false,
}: {
  rows: Row[];
  categories: Cat[];
  accounts: Acc[];
  canEdit: boolean;
  currency: string;
  monthKey: string;
  /** Show a per-row "✓ Sorted" / "To sort" pill (account detail page). */
  statusPill?: boolean;
  /** Drop the Account column + filter when every row is the same account. */
  hideAccountColumn?: boolean;
  /** Namespaces the persisted column layout (widths + order) in localStorage. */
  storageKey?: string;
  /** "To sort" inbox mode: a row that becomes sorted disappears from the list. */
  removeWhenSorted?: boolean;
}) {
  const [data, setData] = useState(rows);
  const [cats, setCats] = useState(categories);
  useEffect(() => setData(rows), [rows]);
  useEffect(() => setCats(categories), [categories]);

  const [q, setQ] = useState("");
  const [accSel, setAccSel] = useState<Set<string>>(new Set());
  const [catSel, setCatSel] = useState<Set<string>>(new Set()); // category ids + "none"
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set()); // unsorted | sorted | transfer
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Multi-column sort: a priority-ordered list. Plain click sorts by one column
  // (3-state asc -> desc -> off); Ctrl/Cmd+click adds the column as a sub-sort.
  const [sortSpec, setSortSpec] = useState<{ key: SortKey; dir: SortDir }[]>([
    { key: "date", dir: "desc" },
  ]);
  const [msg, setMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modal, setModal] = useState<{ txnId: string; name: string } | null>(null);
  const [ruleModal, setRuleModal] = useState<Row | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [, startTransition] = useTransition();

  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const accName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const fmt = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });

  // ── Column layout (widths + order), persisted per view ─────────────────────
  const lsPrefix = `txngrid.${storageKey}`;
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [colOrder, setColOrder] = useState<string[]>([]);
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      const w = window.localStorage.getItem(`${lsPrefix}.widths`);
      if (w) {
        const parsed = JSON.parse(w) as Record<string, unknown>;
        if (parsed && typeof parsed === "object") {
          const clean: Record<string, number> = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "number" && v > 0) clean[k] = v;
          }
          setColWidths(clean);
        }
      }
      const o = window.localStorage.getItem(`${lsPrefix}.order`);
      if (o) {
        const parsed = JSON.parse(o) as unknown;
        if (Array.isArray(parsed)) {
          setColOrder(parsed.filter((k): k is string => typeof k === "string"));
        }
      }
    } catch {
      /* corrupted layout never breaks the grid */
    }
    setLayoutLoaded(true);
  }, [lsPrefix]);

  useEffect(() => {
    if (!layoutLoaded) return;
    try { window.localStorage.setItem(`${lsPrefix}.widths`, JSON.stringify(colWidths)); } catch { /* ignore */ }
  }, [colWidths, layoutLoaded, lsPrefix]);

  useEffect(() => {
    if (!layoutLoaded) return;
    try { window.localStorage.setItem(`${lsPrefix}.order`, JSON.stringify(colOrder)); } catch { /* ignore */ }
  }, [colOrder, layoutLoaded, lsPrefix]);

  const baseCols = useMemo<ColDef[]>(() => {
    const cols: ColDef[] = [
      { key: "date", label: "Date", width: 118, minWidth: 70, align: "left", sortable: true, movable: true },
      { key: "desc", label: "Description", minWidth: 120, align: "left", sortable: true, movable: true },
    ];
    if (!hideAccountColumn) {
      cols.push({ key: "account", label: "Account", width: 140, minWidth: 70, align: "left", sortable: true, movable: true });
    }
    cols.push(
      { key: "category", label: "Category", width: 210, minWidth: 90, align: "left", sortable: true, movable: true },
      { key: "amount", label: "Amount", width: 110, minWidth: 70, align: "right", sortable: true, movable: true },
    );
    return cols;
  }, [hideAccountColumn]);

  const orderedCols = useMemo<ColDef[]>(() => {
    const cols = colOrder.length
      ? [...baseCols].sort((a, b) => {
          const ai = colOrder.indexOf(a.key), bi = colOrder.indexOf(b.key);
          if (ai === -1 && bi === -1) return 0;
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        })
      : baseCols;
    // The actions column (transfer / delete) is pinned last and never moves.
    return canEdit
      ? [...cols, { key: "actions", label: "", width: 118, minWidth: 108, align: "right", sortable: false, movable: false } as ColDef]
      : cols;
  }, [baseCols, colOrder, canEdit]);

  function reorderCols(srcKey: string, destKey: string) {
    if (srcKey === destKey) {
      setDragKey(null); setDragOverKey(null);
      return;
    }
    const keys = orderedCols.filter((c) => c.movable).map((c) => c.key as string);
    const fromIdx = keys.indexOf(srcKey);
    if (fromIdx === -1) return;
    keys.splice(fromIdx, 1);
    const toIdx = keys.indexOf(destKey);
    keys.splice(toIdx === -1 ? keys.length : toIdx, 0, srcKey);
    setColOrder(keys);
    setDragKey(null);
    setDragOverKey(null);
  }

  const startResize = (e: React.MouseEvent, colKey: string, minWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    // Read the th's actual rendered width so an un-resized (flex) column
    // doesn't snap to some fallback the moment the drag starts.
    let thEl: HTMLElement | null = e.currentTarget as HTMLElement;
    while (thEl && thEl.tagName !== "TH") thEl = thEl.parentElement;
    const renderedW = thEl ? Math.round(thEl.getBoundingClientRect().width) : 150;
    const startX = e.clientX;
    const startW = colWidths[colKey] ?? renderedW;
    // Lock the body cursor for the whole drag so it stays col-resize even
    // when the pointer drifts off the narrow handle. Restored on mouseup.
    const prevBodyCursor = document.body.style.cursor;
    document.body.style.cursor = "col-resize";
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(minWidth, Math.round(startW + (ev.clientX - startX)));
      setColWidths((prev) => ({ ...prev, [colKey]: newW }));
    };
    const onUp = () => {
      document.body.style.cursor = prevBodyCursor;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const resetColWidth = (colKey: string) => {
    setColWidths((prev) => {
      const next = { ...prev };
      delete next[colKey];
      return next;
    });
  };

  const resetLayout = () => {
    setColWidths({});
    setColOrder([]);
    try {
      window.localStorage.removeItem(`${lsPrefix}.widths`);
      window.localStorage.removeItem(`${lsPrefix}.order`);
    } catch { /* ignore */ }
  };

  const layoutCustomised = colOrder.length > 0 || Object.keys(colWidths).length > 0;

  // ── Data mutations (unchanged) ──────────────────────────────────────────────

  const applyCategory = (txnId: string, category: Cat | null) => {
    const prev = data;
    setData((d) =>
      removeWhenSorted && category
        ? d.filter((r) => r.id !== txnId) // sorted — it leaves the inbox
        : d.map((r) =>
            r.id === txnId
              ? { ...r, category_id: category?.id ?? null, reviewed: !!category, suggested_category_id: null }
              : r
          )
    );
    startTransition(async () => {
      const res = await assignCategoryInline(txnId, category?.id ?? null);
      if (!res.ok) {
        setData(prev);
        setMsg(res.error ?? "Could not save category");
      }
    });
  };

  const acceptOne = (txnId: string) => {
    const prev = data;
    setData((d) =>
      removeWhenSorted
        ? d.filter((r) => r.id !== txnId)
        : d.map((r) =>
            r.id === txnId
              ? { ...r, category_id: r.suggested_category_id, reviewed: true, suggested_category_id: null }
              : r
          )
    );
    startTransition(async () => {
      const res = await acceptSuggestion(txnId);
      if (!res.ok) {
        setData(prev);
        setMsg(res.error ?? "Could not accept suggestion");
      }
    });
  };

  /** The tick: confirm a rule-applied category (payee memory / bank match). */
  const confirmOne = (txnId: string) => {
    const prev = data;
    setData((d) =>
      removeWhenSorted
        ? d.filter((r) => r.id !== txnId)
        : d.map((r) => (r.id === txnId ? { ...r, reviewed: true } : r))
    );
    startTransition(async () => {
      const res = await confirmCategoryInline(txnId);
      if (!res.ok) {
        setData(prev);
        setMsg(res.error ?? "Could not confirm");
      }
    });
  };

  /** Confirm every visible rule-applied category in one go. */
  const confirmShown = (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const prev = data;
    setData((d) =>
      removeWhenSorted
        ? d.filter((r) => !idSet.has(r.id))
        : d.map((r) => (idSet.has(r.id) ? { ...r, reviewed: true } : r))
    );
    startTransition(async () => {
      const res = await confirmAllInline(ids);
      if (!res.ok) {
        setData(prev);
        setMsg(res.error ?? "Could not confirm");
      }
    });
  };

  const dismissOne = (txnId: string) => {
    const prev = data;
    setData((d) => d.map((r) => (r.id === txnId ? { ...r, suggested_category_id: null } : r)));
    startTransition(async () => {
      const res = await dismissSuggestion(txnId);
      if (!res.ok) {
        setData(prev);
        setMsg(res.error ?? "Could not dismiss suggestion");
      }
    });
  };

  const runSuggest = () => {
    setAiBusy(true);
    startTransition(async () => {
      const res = await suggestCategories(monthKey);
      setAiBusy(false);
      if (!res.ok) {
        setMsg(res.error ?? "Suggestions failed");
        return;
      }
      if (res.suggestions.length === 0) {
        setMsg("Nothing new to suggest — everything is categorised or already has a suggestion.");
        return;
      }
      const byTxn = new Map(res.suggestions.map((s) => [s.txnId, s.categoryId]));
      setData((d) =>
        d.map((r) => (byTxn.has(r.id) ? { ...r, suggested_category_id: byTxn.get(r.id)! } : r))
      );
    });
  };

  const acceptAll = () => {
    const ids = data.filter((r) => !r.category_id && r.suggested_category_id).map((r) => r.id);
    if (ids.length === 0) return;
    const prev = data;
    setData((d) =>
      d.map((r) =>
        !r.category_id && r.suggested_category_id
          ? { ...r, category_id: r.suggested_category_id, suggested_category_id: null }
          : r
      )
    );
    startTransition(async () => {
      const res = await acceptAllSuggestions(ids);
      if (!res.ok) {
        setData(prev);
        setMsg(res.error ?? "Could not accept suggestions");
      }
    });
  };

  const suggestionCount = data.filter((r) => !r.category_id && r.suggested_category_id && !r.is_transfer).length;
  const confirmableIds = useMemo(
    () => data.filter((r) => rowStatus(r) === "toconfirm").map((r) => r.id),
    [data]
  );

  const toggleTransfer = (txnId: string, makeTransfer: boolean) => {
    const prev = data;
    setData((d) =>
      d.map((r) =>
        r.id === txnId ? { ...r, is_transfer: makeTransfer, suggested_category_id: null } : r
      )
    );
    startTransition(async () => {
      const res = await setTransferInline(txnId, makeTransfer);
      if (!res.ok) {
        setData(prev);
        setMsg(res.error ?? "Could not update");
        return;
      }
      // the matching leg on the other account follows along
      if (res.pairedId)
        setData((d) =>
          d.map((r) => (r.id === res.pairedId ? { ...r, is_transfer: makeTransfer } : r))
        );
    });
  };

  /** Split finances: flip a row between household and personal. Optimistic. */
  const toggleScope = (txnId: string, scope: "household" | "personal") => {
    const prev = data;
    setData((d) => d.map((r) => (r.id === txnId ? { ...r, scope } : r)));
    startTransition(async () => {
      const res = await setScopeInline(txnId, scope);
      if (!res.ok) {
        setData(prev);
        setMsg(res.error ?? "Could not update");
      }
    });
  };

  const runFindTransfers = () => {
    setTransferBusy(true);
    startTransition(async () => {
      const res = await findTransfersInline();
      setTransferBusy(false);
      if (!res.ok) {
        setMsg(res.error ?? "Could not scan for transfers");
        return;
      }
      setMsg(
        res.found === 0
          ? "No new transfers found — everything already looks right."
          : `Found ${res.found} transfer${res.found === 1 ? "" : "s"} between your accounts — they no longer count as spending or income. Refresh to see them.`
      );
    });
  };

  const removeRow = (txnId: string) => {
    if (!window.confirm("Delete this transaction?")) return;
    const prev = data;
    setData((d) => d.filter((r) => r.id !== txnId));
    startTransition(async () => {
      const res = await deleteTransactionInline(txnId);
      if (!res.ok) {
        setData(prev);
        setMsg(res.error ?? "Could not delete");
      }
    });
  };

  // ── Filter + sort ───────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = data.filter((r) => {
      if (needle && !`${r.description} ${r.merchant ?? ""}`.toLowerCase().includes(needle)) return false;
      if (accSel.size > 0 && (!r.account_id || !accSel.has(r.account_id))) return false;
      if (catSel.size > 0) {
        const catMatch = r.category_id ? catSel.has(r.category_id) : catSel.has("none");
        if (!catMatch) return false;
      }
      if (statusSel.size > 0) {
        // "Personal" is a scope, not a sorting state — it narrows (ANDs with)
        // whatever other statuses are ticked instead of ORing alongside them.
        if (statusSel.has("personal") && r.scope !== "personal") return false;
        const others = [...statusSel].filter((v) => v !== "personal");
        if (others.length > 0 && !others.includes(rowStatus(r))) return false;
      }
      if (from && r.posted_at < from) return false;
      if (to && r.posted_at > to) return false;
      return true;
    });
    if (sortSpec.length === 0) return list;
    const val = (r: Row, k: SortKey): string | number => {
      switch (k) {
        case "date": return r.posted_at;
        case "desc": return (r.merchant ?? r.description).toLowerCase();
        case "account": return r.account_id ? (accName.get(r.account_id) ?? "") : "";
        case "category": return r.category_id ? (catById.get(r.category_id)?.name ?? "") : "";
        case "amount": return r.amount;
      }
    };
    // Stable multi-key sort: compare in priority order, fall through on ties.
    return [...list].sort((a, b) => {
      for (const { key, dir } of sortSpec) {
        const av = val(a, key), bv = val(b, key);
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv), undefined, { sensitivity: "base" });
        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  }, [data, q, accSel, catSel, statusSel, from, to, sortSpec, accName, catById]);

  const totals = useMemo(() => {
    let inn = 0, out = 0, transfers = 0;
    for (const r of filtered) {
      if (r.is_transfer) {
        transfers++;
        continue; // moving money between your own accounts is neither in nor out
      }
      r.amount >= 0 ? (inn += r.amount) : (out += r.amount);
    }
    return { inn, out, net: inn + out, n: filtered.length, transfers };
  }, [filtered]);

  // Plain click: sort by this column alone, 3-state asc -> desc -> off.
  // Ctrl/Cmd+click: append as the next priority, then cycle asc -> desc -> remove.
  const handleSort = (key: SortKey, additive: boolean) => {
    setSortSpec((prev) => {
      const idx = prev.findIndex((s) => s.key === key);
      if (additive) {
        if (idx === -1) return [...prev, { key, dir: "asc" as SortDir }];
        if (prev[idx].dir === "asc") {
          const next = [...prev];
          next[idx] = { key, dir: "desc" };
          return next;
        }
        return prev.filter((s) => s.key !== key);
      }
      if (prev.length === 1 && idx === 0) {
        return prev[0].dir === "asc" ? [{ key, dir: "desc" as SortDir }] : [];
      }
      return [{ key, dir: "asc" as SortDir }];
    });
  };

  const exportCsv = () => {
    const head = "Date,Description,Merchant,Account,Category,Scope,Amount";
    const lines = filtered.map((r) =>
      [
        r.posted_at,
        `"${r.description.replaceAll('"', '""')}"`,
        `"${(r.merchant ?? "").replaceAll('"', '""')}"`,
        `"${r.account_id ? (accName.get(r.account_id) ?? "") : ""}"`,
        `"${r.category_id ? (catById.get(r.category_id)?.name ?? "") : ""}"`,
        r.scope,
        r.amount,
      ].join(",")
    );
    const blob = new Blob([[head, ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nestly-transactions-${monthKey}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const catOptions = useMemo(
    () => [
      { value: "none", label: "◌ Uncategorised" },
      ...cats.map((c) => ({ value: c.id, label: `${c.icon ?? "🏷️"} ${c.name}` })),
    ],
    [cats]
  );
  const accOptions = useMemo(() => accounts.map((a) => ({ value: a.id, label: a.name })), [accounts]);

  // ── Header cell (sort + drag-reorder + resize, mirrors Tracey's DataTable) ──

  const renderTh = (col: ColDef) => {
    const sortIdx = col.sortable ? sortSpec.findIndex((s) => s.key === col.key) : -1;
    const isSorted = sortIdx >= 0;
    const sortDirHere = isSorted ? sortSpec[sortIdx].dir : null;
    const sortPriority = isSorted && sortSpec.length > 1 ? sortIdx + 1 : null;
    return (
      <th
        key={col.key}
        onClick={(e) => col.sortable && handleSort(col.key as SortKey, e.ctrlKey || e.metaKey)}
        title={col.sortable ? "Click to sort · Ctrl+click (Cmd on Mac) to add a sub-sort" : undefined}
        onDragOver={
          dragKey && col.movable
            ? (e) => {
                e.preventDefault();
                if (dragOverKey !== col.key) setDragOverKey(col.key);
              }
            : undefined
        }
        onDragLeave={() => {
          if (dragOverKey === col.key) setDragOverKey(null);
        }}
        onDrop={
          dragKey && col.movable
            ? (e) => {
                e.preventDefault();
                reorderCols(dragKey, col.key);
              }
            : undefined
        }
        className={`relative select-none overflow-hidden px-3 py-2.5 font-medium ${
          col.align === "right" ? "text-right" : "text-left"
        } ${col.sortable ? "cursor-pointer hover:bg-stone-800" : ""} ${
          isSorted ? "text-sky-300" : ""
        }`}
        style={{
          boxShadow:
            dragOverKey === col.key && dragKey && dragKey !== col.key
              ? "inset 3px 0 0 #2563eb"
              : undefined,
        }}
      >
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap align-middle">
          {col.movable && (
            <span
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData("text/plain", col.key);
                e.dataTransfer.effectAllowed = "move";
                setDragKey(col.key);
              }}
              onDragEnd={() => {
                setDragKey(null);
                setDragOverKey(null);
              }}
              onClick={(e) => e.stopPropagation()}
              title="Drag to reorder this column"
              className="cursor-grab text-stone-500"
              style={{ fontSize: "0.8rem", lineHeight: 1 }}
            >
              ⠿
            </span>
          )}
          {col.label}
          {col.sortable && (
            <span
              className={isSorted ? "text-sky-300" : "text-stone-500"}
              style={{ fontSize: "0.6875rem", lineHeight: 1 }}
            >
              {isSorted ? (sortDirHere === "asc" ? "▲" : "▼") : "⇅"}
              {sortPriority != null && (
                <sup
                  style={{ fontSize: "0.55rem", fontWeight: 800, marginLeft: "1px", verticalAlign: "super" }}
                >
                  {sortPriority}
                </sup>
              )}
            </span>
          )}
        </span>

        {/* Resize handle — wider hit area with an always-visible divider so
            users can see column boundaries (and learn they're draggable). */}
        <span
          onMouseDown={(e) => startResize(e, col.key, col.minWidth)}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            // Double-click resets this column's width to default.
            e.stopPropagation();
            resetColWidth(col.key);
          }}
          title="Drag to resize · double-click to reset"
          className="absolute bottom-0 right-0 top-0 z-10 flex w-2.5 cursor-col-resize items-stretch justify-center"
          onMouseEnter={(e) => {
            const bar = e.currentTarget.firstElementChild as HTMLElement | null;
            if (bar) {
              bar.style.background = "#5eead4";
              bar.style.width = "3px";
            }
          }}
          onMouseLeave={(e) => {
            const bar = e.currentTarget.firstElementChild as HTMLElement | null;
            if (bar) {
              bar.style.background = "rgba(255,255,255,0.28)";
              bar.style.width = "1px";
            }
          }}
        >
          <span
            style={{
              width: "1px",
              background: "rgba(255,255,255,0.28)",
              marginTop: "0.4rem",
              marginBottom: "0.4rem",
              transition: "background 0.12s, width 0.12s",
            }}
          />
        </span>
      </th>
    );
  };

  // ── Body cell per column key ────────────────────────────────────────────────

  const renderTd = (t: Row, col: ColDef) => {
    switch (col.key) {
      case "date":
        return (
          <td key={col.key} className="overflow-hidden whitespace-nowrap px-3 py-2 tabular-nums text-stone-500">
            {fmtDate(t.posted_at)}
          </td>
        );
      case "desc":
        return (
          <td key={col.key} className="truncate px-3 py-2" title={t.description}>
            {t.merchant ?? t.description}
            {t.source !== "manual" && (
              <span className="ml-2 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] uppercase text-stone-400">{t.source}</span>
            )}
            {t.status === "pending" && (
              <span
                className="ml-2 rounded-full border border-dashed border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                title="Not settled by the bank yet — details may change; it upgrades in place when it posts."
              >
                ⏳ Pending
              </span>
            )}
            {statusPill &&
              (rowStatus(t) === "unsorted" ? (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">To sort</span>
              ) : rowStatus(t) === "toconfirm" ? (
                <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700">🪄 To confirm</span>
              ) : (
                <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-700">✓ Sorted</span>
              ))}
          </td>
        );
      case "account":
        return (
          <td key={col.key} className="truncate px-3 py-2 text-stone-500">
            {t.account_id ? accName.get(t.account_id) : "—"}
          </td>
        );
      case "category":
        return (
          <td key={col.key} className="px-3 py-2">
            {t.is_transfer ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                🔁 Transfer
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => toggleTransfer(t.id, false)}
                    title="Not a transfer — count it again"
                    className="text-sky-400 hover:text-sky-700"
                  >
                    ✕
                  </button>
                )}
              </span>
            ) : canEdit ? (
              <div>
                <CategoryPicker
                  current={t.category_id ? (catById.get(t.category_id) ?? null) : null}
                  categories={cats}
                  onPick={(c) => applyCategory(t.id, c)}
                  onCreate={(name) => setModal({ txnId: t.id, name })}
                />
                {!t.category_id && t.suggested_category_id && catById.get(t.suggested_category_id) && (
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-violet-700">
                    <span className="truncate">
                      ✨ {catById.get(t.suggested_category_id)!.icon ?? ""}{" "}
                      {catById.get(t.suggested_category_id)!.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => acceptOne(t.id)}
                      className="rounded bg-violet-100 px-1.5 py-0.5 font-medium hover:bg-violet-200"
                      title="Accept suggestion"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissOne(t.id)}
                      className="rounded px-1 py-0.5 text-stone-400 hover:bg-stone-100"
                      title="Dismiss suggestion"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {t.category_id && !t.reviewed && (
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-violet-700">
                    <span className="truncate" title="Filled in automatically from what you picked for this merchant before">
                      🪄 auto-filled
                    </span>
                    <button
                      type="button"
                      onClick={() => confirmOne(t.id)}
                      className="rounded bg-violet-100 px-1.5 py-0.5 font-medium hover:bg-violet-200"
                      title="Looks right — confirm it"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => applyCategory(t.id, null)}
                      className="rounded px-1 py-0.5 text-stone-400 hover:bg-stone-100"
                      title="Not right — clear it and pick another"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <span className="text-stone-500">
                {t.category_id ? `${catById.get(t.category_id)?.icon ?? ""} ${catById.get(t.category_id)?.name ?? "—"}` : "—"}
              </span>
            )}
            {!t.is_transfer && t.scope === "personal" && (
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => canEdit && toggleScope(t.id, "household")}
                title={canEdit ? "Personal — not counted in household budgets. Click to count it for the family again." : "Personal — not counted in household budgets"}
                className="mt-1 inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500 enabled:hover:bg-stone-200"
              >
                👤 personal
              </button>
            )}
          </td>
        );
      case "amount":
        return (
          <td
            key={col.key}
            className={`whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums ${t.amount < 0 ? "text-stone-800" : "text-emerald-600"}`}
          >
            {fmt(t.amount)}
          </td>
        );
      case "actions":
        return (
          <td key={col.key} className="whitespace-nowrap px-2 py-2 text-right">
            {!t.is_transfer && (
              <button
                type="button"
                onClick={() => setRuleModal(t)}
                className="rounded px-1.5 py-1 text-xs text-stone-300 hover:bg-teal-50 hover:text-teal-700"
                title="Make a rule from this transaction (rule book)"
              >
                📖
              </button>
            )}
            {!t.is_transfer && (
              <button
                type="button"
                onClick={() => toggleTransfer(t.id, true)}
                className="rounded px-1.5 py-1 text-xs text-stone-300 hover:bg-sky-50 hover:text-sky-600"
                title="This is a transfer between our own accounts"
              >
                🔁
              </button>
            )}
            {!t.is_transfer && (
              <button
                type="button"
                onClick={() => toggleScope(t.id, t.scope === "personal" ? "household" : "personal")}
                className={`rounded px-1.5 py-1 text-xs ${t.scope === "personal" ? "bg-stone-100 text-stone-600" : "text-stone-300"} hover:bg-stone-100 hover:text-stone-600`}
                title={t.scope === "personal" ? "Personal — click to count this for the family again" : "Count this as personal, not household"}
              >
                {t.scope === "personal" ? "🏠" : "👤"}
              </button>
            )}
            <button
              type="button"
              onClick={() => removeRow(t.id)}
              className="rounded px-1.5 py-1 text-xs text-stone-300 hover:bg-red-50 hover:text-red-600"
              title="Delete"
            >
              ✕
            </button>
          </td>
        );
    }
  };

  return (
    <div className="space-y-3">
      {msg && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {msg}{" "}
          <button className="underline" onClick={() => setMsg(null)}>dismiss</button>
        </p>
      )}
      {notice && (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-700">
          {notice}{" "}
          <button className="underline" onClick={() => setNotice(null)}>dismiss</button>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Search description or merchant…"
          className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm sm:w-auto sm:min-w-52 sm:flex-1"
        />
        {!hideAccountColumn && (
          <MultiSelectFilter
            label="Account"
            options={accOptions}
            selected={accSel}
            onChange={setAccSel}
            searchable={accOptions.length > 8}
          />
        )}
        <MultiSelectFilter
          label="Category"
          options={catOptions}
          selected={catSel}
          onChange={setCatSel}
          searchable={catOptions.length > 8}
        />
        <MultiSelectFilter
          label="Status"
          options={STATUS_OPTIONS}
          selected={statusSel}
          onChange={setStatusSel}
        />
        <label className="inline-flex items-center gap-1 text-xs text-stone-400">
          from
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[8.4rem] rounded-lg border border-stone-300 px-2 py-1.5 text-sm text-stone-700" />
        </label>
        <label className="inline-flex items-center gap-1 text-xs text-stone-400">
          to
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[8.4rem] rounded-lg border border-stone-300 px-2 py-1.5 text-sm text-stone-700" />
        </label>
        <button type="button" onClick={exportCsv} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-100">
          ⬇ CSV
        </button>
        {canEdit && (
          <Link
            href="/finance/rules"
            title="The rule book — your standing category rules"
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-100"
          >
            📖 Rule book
          </Link>
        )}
        {layoutCustomised && (
          <button
            type="button"
            onClick={resetLayout}
            title="Reset column widths and order to default"
            className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs text-stone-500 hover:bg-stone-100"
          >
            ↺ Layout
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={runSuggest}
            disabled={aiBusy}
            className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
          >
            {aiBusy ? "Thinking…" : "✨ Suggest categories"}
          </button>
        )}
        {canEdit && suggestionCount > 0 && (
          <button
            type="button"
            onClick={acceptAll}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
          >
            ✓ Accept all {suggestionCount}
          </button>
        )}
        {canEdit && confirmableIds.length > 0 && (
          <button
            type="button"
            onClick={() => confirmShown(confirmableIds)}
            title="Confirm every auto-filled category in this list"
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
          >
            🪄 Confirm all {confirmableIds.length}
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={runFindTransfers}
            disabled={transferBusy}
            title="Find money moved between your own accounts and stop counting it as spending"
            className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
          >
            {transferBusy ? "Scanning…" : "🔁 Find transfers"}
          </button>
        )}
      </div>

      {/* Mobile: card rows — everything visible, no sideways hunting */}
      <div className="space-y-2 md:hidden">
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-stone-200 bg-white px-4 py-10 text-center text-sm text-stone-400">
            Nothing matches these filters.
          </p>
        ) : (
          <>
            {filtered.map((t) => {
              const sugg = !t.category_id && t.suggested_category_id ? catById.get(t.suggested_category_id) : null;
              const cat = t.category_id ? catById.get(t.category_id) : null;
              return (
                <div key={t.id} className="rounded-xl border border-stone-200 bg-white p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-stone-400">
                      {fmtDate(t.posted_at)}
                      {!hideAccountColumn && t.account_id && (
                        <span> · {accName.get(t.account_id)}</span>
                      )}
                    </span>
                    <span className={`text-base font-semibold tabular-nums ${t.is_transfer ? "text-stone-400" : t.amount < 0 ? "text-stone-800" : "text-emerald-600"}`}>
                      {fmt(t.amount)}
                    </span>
                  </div>
                  <div className="mt-0.5 break-words text-sm font-medium text-stone-800">
                    {t.merchant ?? t.description}
                  </div>
                  {t.merchant && t.description && t.description !== t.merchant && (
                    <div className="mt-0.5 break-words text-xs text-stone-400">{t.description}</div>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {t.is_transfer ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                          🔁 Transfer
                          {canEdit && (
                            <button type="button" onClick={() => toggleTransfer(t.id, false)} className="text-sky-400" title="Not a transfer">✕</button>
                          )}
                        </span>
                      ) : canEdit ? (
                        <div>
                          <CategoryPicker
                            current={cat ?? null}
                            categories={cats}
                            onPick={(c) => applyCategory(t.id, c)}
                            onCreate={(name) => setModal({ txnId: t.id, name })}
                          />
                          {sugg && (
                            <div className="mt-1 flex items-center gap-1.5 text-[12px] text-violet-700">
                              <span className="truncate">✨ {sugg.icon ?? ""} {sugg.name}</span>
                              <button type="button" onClick={() => acceptOne(t.id)} className="rounded bg-violet-100 px-2 py-0.5 font-medium" title="Accept">✓</button>
                              <button type="button" onClick={() => dismissOne(t.id)} className="rounded px-1.5 py-0.5 text-stone-400" title="Dismiss">✕</button>
                            </div>
                          )}
                          {t.category_id && !t.reviewed && (
                            <div className="mt-1 flex items-center gap-1.5 text-[12px] text-violet-700">
                              <span className="truncate" title="Filled in automatically from what you picked for this merchant before">🪄 auto-filled</span>
                              <button type="button" onClick={() => confirmOne(t.id)} className="rounded bg-violet-100 px-2 py-0.5 font-medium" title="Looks right — confirm it">✓</button>
                              <button type="button" onClick={() => applyCategory(t.id, null)} className="rounded px-1.5 py-0.5 text-stone-400" title="Not right — clear it">✕</button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-stone-500">
                          {cat ? `${cat.icon ?? ""} ${cat.name}` : "—"}
                        </span>
                      )}
                      {!t.is_transfer && t.scope === "personal" && (
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => canEdit && toggleScope(t.id, "household")}
                          title="Personal — not counted in household budgets"
                          className="mt-1 inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500"
                        >
                          👤 personal
                        </button>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {statusPill && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            rowStatus(t) === "unsorted"
                              ? "bg-amber-50 text-amber-700"
                              : rowStatus(t) === "toconfirm"
                                ? "bg-violet-50 text-violet-700"
                                : "bg-teal-50 text-teal-700"
                          }`}
                        >
                          {rowStatus(t) === "unsorted" ? "To sort" : rowStatus(t) === "toconfirm" ? "🪄 To confirm" : "✓ Sorted"}
                        </span>
                      )}
                      {canEdit && !t.is_transfer && (
                        <button type="button" onClick={() => setRuleModal(t)} className="rounded-lg px-2 py-1.5 text-sm text-stone-300 hover:bg-teal-50 hover:text-teal-700" title="Make a rule from this transaction">📖</button>
                      )}
                      {canEdit && !t.is_transfer && (
                        <button type="button" onClick={() => toggleTransfer(t.id, true)} className="rounded-lg px-2 py-1.5 text-sm text-stone-300 hover:bg-sky-50 hover:text-sky-600" title="Transfer between our accounts">🔁</button>
                      )}
                      {canEdit && !t.is_transfer && (
                        <button type="button" onClick={() => toggleScope(t.id, t.scope === "personal" ? "household" : "personal")} className={`rounded-lg px-2 py-1.5 text-sm ${t.scope === "personal" ? "bg-stone-100 text-stone-600" : "text-stone-300"} hover:bg-stone-100 hover:text-stone-600`} title={t.scope === "personal" ? "Count this for the family again" : "Count this as personal, not household"}>{t.scope === "personal" ? "🏠" : "👤"}</button>
                      )}
                      {canEdit && (
                        <button type="button" onClick={() => removeRow(t.id)} className="rounded-lg px-2 py-1.5 text-sm text-stone-300 hover:bg-red-50 hover:text-red-600" title="Delete">✕</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium">
              <span className="text-stone-500">
                {totals.n} transaction{totals.n === 1 ? "" : "s"}
                {totals.transfers > 0 && <span className="text-stone-400"> · {totals.transfers} not counted</span>}
              </span>
              <span className="flex items-center gap-3 tabular-nums">
                <span className="text-emerald-600">in {fmt(totals.inn)}</span>
                <span className="text-red-600">out {fmt(totals.out)}</span>
                <span className={totals.net < 0 ? "text-red-600" : "text-emerald-600"}>net {fmt(totals.net)}</span>
              </span>
            </div>
          </>
        )}
      </div>

      {/* Desktop: the smart-sheet table */}
      <div className="hidden overflow-x-auto rounded-xl border border-stone-200 bg-white md:block">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-stone-400">Nothing matches these filters.</p>
        ) : (
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <colgroup>
              {orderedCols.map((c) => (
                <col key={c.key} style={{ width: colWidths[c.key] ?? c.width }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-stone-200 bg-stone-900 text-white">
                {orderedCols.map((c) => renderTh(c))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => (
                <tr key={t.id} className={`border-b border-stone-100 ${i % 2 ? "bg-stone-50" : ""}`}>
                  {orderedCols.map((c) => renderTd(t, c))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-200 bg-stone-50 text-xs font-medium">
                <td colSpan={orderedCols.length} className="px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-stone-500">
                      {totals.n} transaction{totals.n === 1 ? "" : "s"}
                      {totals.transfers > 0 && (
                        <span className="text-stone-400"> · {totals.transfers} transfer{totals.transfers === 1 ? "" : "s"} not counted</span>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-3 tabular-nums">
                      <span className="text-emerald-600">in {fmt(totals.inn)}</span>
                      <span className="text-red-600">out {fmt(totals.out)}</span>
                      <span className={totals.net < 0 ? "text-red-600" : "text-emerald-600"}>
                        net {fmt(totals.net)}
                      </span>
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {modal && (
        <NewCategoryModal
          initialName={modal.name}
          onClose={() => setModal(null)}
          onCreated={(category) => {
            setCats((c) => [...c, category].sort((a, b) => a.name.localeCompare(b.name)));
            applyCategory(modal.txnId, category);
            setModal(null);
          }}
        />
      )}

      {ruleModal && (
        <NewRuleModal
          categories={cats}
          onCategoryCreated={(c) =>
            setCats((p) => [...p, c].sort((a, b) => a.name.localeCompare(b.name)))
          }
          initialText={(ruleModal.merchant ?? ruleModal.description).trim().slice(0, 120)}
          initialCategoryId={ruleModal.category_id ?? ruleModal.suggested_category_id ?? ""}
          onClose={() => setRuleModal(null)}
          onCreated={(rule, applied) => {
            // reflect the retro-applied suggestions in this list straight away
            setData((d) =>
              d.map((r) =>
                !r.category_id && !r.is_transfer && ruleMatches(rule, r.description, r.merchant)
                  ? { ...r, suggested_category_id: rule.category_id }
                  : r
              )
            );
            setRuleModal(null);
            setNotice(
              applied > 0
                ? `Rule saved — its category is now suggested on ${applied} unsorted transaction${applied === 1 ? "" : "s"} (accept with ✓). New arrivals matching it will come in pre-filled.`
                : "Rule saved — new arrivals matching it will come in pre-filled, ready for your tick."
            );
          }}
        />
      )}
    </div>
  );
}

function CategoryPicker({
  current,
  categories,
  onPick,
  onCreate,
}: {
  current: Cat | null;
  categories: Cat[];
  onPick: (c: Cat | null) => void;
  onCreate: (typedName: string) => void;
}) {
  const [q, setQ] = useState(current?.name ?? "");
  const [open, setOpen] = useState(false);
  useEffect(() => setQ(current?.name ?? ""), [current]);

  const needle = q.trim().toLowerCase();
  const filtered = needle ? categories.filter((c) => c.name.toLowerCase().includes(needle)) : categories;
  const exact = categories.find((c) => c.name.trim().toLowerCase() === needle) ?? null;

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (exact) onPick(exact);
            else if (needle) onCreate(q.trim());
            setOpen(false);
          }
        }}
        placeholder="category…"
        autoComplete="off"
        className={`w-40 rounded-lg border px-2 py-1 text-xs outline-none focus:border-stone-500 ${
          current ? "border-stone-200 bg-white" : "border-amber-300 bg-amber-50"
        }`}
      />
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
          <div className="max-h-52 overflow-y-auto py-1">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(null);
                setQ("");
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-stone-400 hover:bg-stone-50"
            >
              — no category —
            </button>
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(c);
                  setQ(c.name);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-stone-50"
              >
                <span>{c.icon ?? "🏷️"}</span>
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onCreate(needle && !exact ? q.trim() : "");
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 border-t border-stone-100 bg-teal-50 px-3 py-2 text-left text-xs font-medium text-teal-700 hover:bg-teal-100"
          >
            ＋ New category{needle && !exact ? ` “${q.trim()}”` : "…"}
          </button>
        </div>
      )}
    </div>
  );
}
