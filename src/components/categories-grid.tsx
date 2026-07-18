"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  createCategoryInline,
  updateCategoryInline,
  deleteCategoryInline,
  setBudgetInline,
} from "@/lib/actions/finance";

type Cat = { id: string; name: string; icon: string | null; kind: string };
type Row = Cat & { budget: number | null };
type SortKey = "name" | "kind" | "budget";
type SortDir = "asc" | "desc";

type ColDef = {
  key: SortKey | "icon" | "actions";
  label: string;
  /** Default width in px. Undefined = flex (takes the remaining space). */
  width?: number;
  minWidth: number;
  align: "left" | "right";
  sortable: boolean;
  /** Can be dragged to a new position. The actions column stays pinned last. */
  movable: boolean;
};

const EMOJIS = ["🐾","🔌","🛠️","🚗","🏠","🛒","🍽️","🎬","👕","💊","✈️","🎁","📱","🎓","⚡","💧","🏋️","🎮","🧸","☕","🎰","🏦","💳","🧾"];

// ── MultiSelectFilter — same compact checkbox popover as the transactions grid ─

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

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
        <div className="absolute left-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
          <div className="max-h-56 overflow-y-auto py-1">
            {options.map((o) => (
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

// ── Inline cell editors ──────────────────────────────────────────────────────

/** Text cell that holds a local string while focused and commits on blur/Enter. */
function NameCell({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [s, setS] = useState(value);
  useEffect(() => setS(value), [value]);
  const commit = () => {
    const clean = s.trim();
    if (clean && clean !== value) onCommit(clean);
    else setS(value);
  };
  return (
    <input
      value={s}
      onChange={(e) => setS(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setS(value); (e.target as HTMLInputElement).blur(); }
      }}
      className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none"
    />
  );
}

/** Budget cell — local string, commit on blur/Enter; empty or 0 removes the budget. */
function BudgetCell({
  value,
  onCommit,
  fmt,
}: {
  value: number | null;
  onCommit: (n: number) => void;
  fmt: (n: number) => string;
}) {
  const [s, setS] = useState(value == null ? "" : String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setS(value == null ? "" : String(value)); }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const n = s.trim() === "" ? 0 : Number(s);
    if (Number.isNaN(n) || n < 0) { setS(value == null ? "" : String(value)); return; }
    if (n !== (value ?? 0)) onCommit(n);
  };
  return (
    <div className="flex items-center justify-end gap-1.5">
      <input
        type="number"
        step="0.01"
        min="0"
        value={s}
        placeholder="—"
        onFocus={() => setEditing(true)}
        onChange={(e) => setS(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setS(value == null ? "" : String(value)); setEditing(false); (e.target as HTMLInputElement).blur(); }
        }}
        className="w-24 rounded-lg border border-transparent bg-transparent px-2 py-1 text-right text-sm tabular-nums hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none"
      />
      {value != null && !editing && <span className="text-[10px] text-stone-400">{fmt(value)}/mo</span>}
    </div>
  );
}

/** Emoji cell — click to open a picker popover (quick picks + any emoji). */
function EmojiCell({ value, onCommit }: { value: string | null; onCommit: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const pick = (v: string) => {
    const clean = v.trim().slice(0, 8);
    if (clean) onCommit(clean);
    setCustom("");
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Change emoji"
        className="rounded-lg border border-transparent px-1.5 py-0.5 text-lg hover:border-stone-200 hover:bg-stone-50"
      >
        {value ?? "🏷️"}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-stone-200 bg-white p-2 shadow-lg">
          <div className="flex flex-wrap gap-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => pick(e)}
                className={`rounded-lg border px-1.5 py-0.5 text-base ${e === value ? "border-stone-900 ring-1 ring-stone-900" : "border-stone-200 hover:bg-stone-50"}`}
              >
                {e}
              </button>
            ))}
          </div>
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") pick(custom); }}
            placeholder="…or any emoji, then Enter"
            className="mt-2 w-full rounded-lg border border-stone-300 px-2 py-1 text-xs outline-none focus:border-stone-500"
          />
        </div>
      )}
    </div>
  );
}

// ── The grid ─────────────────────────────────────────────────────────────────

export function CategoriesGrid({
  categories,
  budgets,
  currency,
  storageKey = "setup",
}: {
  categories: Cat[];
  budgets: Record<string, number>;
  currency: string;
  /** Namespaces the persisted column layout (widths + order) in localStorage. */
  storageKey?: string;
}) {
  const [data, setData] = useState<Row[]>(() =>
    categories.map((c) => ({ ...c, budget: budgets[c.id] ?? null }))
  );
  useEffect(() => {
    setData(categories.map((c) => ({ ...c, budget: budgets[c.id] ?? null })));
  }, [categories, budgets]);

  const [q, setQ] = useState("");
  const [kindSel, setKindSel] = useState<Set<string>>(new Set());
  const [budgetSel, setBudgetSel] = useState<Set<string>>(new Set());
  // Multi-column sort: a priority-ordered list. Plain click sorts by one column
  // (3-state asc -> desc -> off); Ctrl/Cmd+click adds the column as a sub-sort.
  const [sortSpec, setSortSpec] = useState<{ key: SortKey; dir: SortDir }[]>([
    { key: "kind", dir: "asc" },
    { key: "name", dir: "asc" },
  ]);
  const [msg, setMsg] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [, startTransition] = useTransition();

  const fmt = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);

  // ── Column layout (widths + order), persisted — same kit as the txn grid ───
  const lsPrefix = `catgrid.${storageKey}`;
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

  const baseCols = useMemo<ColDef[]>(
    () => [
      { key: "icon", label: "", width: 64, minWidth: 50, align: "left", sortable: false, movable: true },
      { key: "name", label: "Name", minWidth: 140, align: "left", sortable: true, movable: true },
      { key: "kind", label: "Kind", width: 130, minWidth: 90, align: "left", sortable: true, movable: true },
      { key: "budget", label: "Monthly budget", width: 190, minWidth: 110, align: "right", sortable: true, movable: true },
    ],
    []
  );

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
    // The actions column (delete) is pinned last and never moves.
    return [...cols, { key: "actions", label: "", width: 56, minWidth: 50, align: "right", sortable: false, movable: false } as ColDef];
  }, [baseCols, colOrder]);

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
    let thEl: HTMLElement | null = e.currentTarget as HTMLElement;
    while (thEl && thEl.tagName !== "TH") thEl = thEl.parentElement;
    const renderedW = thEl ? Math.round(thEl.getBoundingClientRect().width) : 150;
    const startX = e.clientX;
    const startW = colWidths[colKey] ?? renderedW;
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

  // ── Data mutations — optimistic with rollback ──────────────────────────────

  const patchRow = (id: string, patch: Partial<Row>, persist: () => Promise<{ ok: boolean; error?: string }>) => {
    const prev = data;
    setData((d) => d.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    startTransition(async () => {
      const res = await persist();
      if (!res.ok) {
        setData(prev);
        setMsg(res.error ?? "Could not save");
      }
    });
  };

  const rename = (id: string, name: string) =>
    patchRow(id, { name }, () => updateCategoryInline(id, { name }));
  const setIcon = (id: string, icon: string) =>
    patchRow(id, { icon }, () => updateCategoryInline(id, { icon }));
  const setKind = (id: string, kind: string) =>
    patchRow(id, { kind }, () => updateCategoryInline(id, { kind }));
  const setBudget = (id: string, amount: number) =>
    patchRow(id, { budget: amount > 0 ? amount : null }, () => setBudgetInline(id, amount));

  const removeRow = (row: Row) => {
    if (!window.confirm(`Delete "${row.name}"? Transactions keep their history but lose this label; any budget for it is removed.`)) return;
    const prev = data;
    setData((d) => d.filter((r) => r.id !== row.id));
    startTransition(async () => {
      const res = await deleteCategoryInline(row.id);
      if (!res.ok) {
        setData(prev);
        setMsg(res.error ?? "Could not delete");
      }
    });
  };

  // ── Filter + sort ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = data.filter((r) => {
      if (needle && !r.name.toLowerCase().includes(needle)) return false;
      if (kindSel.size > 0 && !kindSel.has(r.kind)) return false;
      if (budgetSel.size > 0) {
        const state = r.budget != null ? "with" : "without";
        if (!budgetSel.has(state)) return false;
      }
      return true;
    });
    if (sortSpec.length === 0) return list;
    const val = (r: Row, k: SortKey): string | number => {
      switch (k) {
        case "name": return r.name.toLowerCase();
        case "kind": return r.kind;
        case "budget": return r.budget ?? -1;
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
  }, [data, q, kindSel, budgetSel, sortSpec]);

  const totals = useMemo(() => {
    let expense = 0, income = 0, budgeted = 0;
    for (const r of filtered) {
      r.kind === "income" ? income++ : expense++;
      if (r.budget != null) budgeted += r.budget;
    }
    return { n: filtered.length, expense, income, budgeted };
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
    const head = "Name,Kind,Emoji,Monthly budget";
    const lines = filtered.map((r) =>
      [
        `"${r.name.replaceAll('"', '""')}"`,
        r.kind,
        `"${(r.icon ?? "").replaceAll('"', '""')}"`,
        r.budget ?? "",
      ].join(",")
    );
    const blob = new Blob(["﻿" + [head, ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nestly-categories.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── Header cell (sort + drag-reorder + resize — the house kit) ─────────────

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

        <span
          onMouseDown={(e) => startResize(e, col.key, col.minWidth)}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
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

  // ── Body cell per column key ───────────────────────────────────────────────

  const renderTd = (r: Row, col: ColDef) => {
    switch (col.key) {
      case "icon":
        return (
          <td key={col.key} className="px-2 py-1.5">
            <EmojiCell value={r.icon} onCommit={(v) => setIcon(r.id, v)} />
          </td>
        );
      case "name":
        return (
          <td key={col.key} className="px-1 py-1.5">
            <NameCell value={r.name} onCommit={(v) => rename(r.id, v)} />
          </td>
        );
      case "kind":
        return (
          <td key={col.key} className="px-3 py-1.5">
            <button
              type="button"
              onClick={() => setKind(r.id, r.kind === "income" ? "expense" : "income")}
              title="Click to switch between expense and income"
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                r.kind === "income"
                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {r.kind}
            </button>
          </td>
        );
      case "budget":
        return (
          <td key={col.key} className="px-2 py-1.5 text-right">
            {r.kind === "income" ? (
              <span className="pr-2 text-xs text-stone-300" title="Budgets apply to expense categories">—</span>
            ) : (
              <BudgetCell value={r.budget} onCommit={(n) => setBudget(r.id, n)} fmt={fmt} />
            )}
          </td>
        );
      case "actions":
        return (
          <td key={col.key} className="whitespace-nowrap px-2 py-1.5 text-right">
            <button
              type="button"
              onClick={() => removeRow(r)}
              className="rounded px-1.5 py-1 text-xs text-stone-300 hover:bg-red-50 hover:text-red-600"
              title="Delete category"
            >
              ✕
            </button>
          </td>
        );
      default:
        return null;
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

      {/* Toolbar — search + filters + tools, all in the header space */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Search categories…"
          className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm sm:w-auto sm:min-w-52 sm:flex-1"
        />
        <MultiSelectFilter
          label="Kind"
          options={[
            { value: "expense", label: "Expense" },
            { value: "income", label: "Income" },
          ]}
          selected={kindSel}
          onChange={setKindSel}
        />
        <MultiSelectFilter
          label="Budget"
          options={[
            { value: "with", label: "Has a budget" },
            { value: "without", label: "No budget" },
          ]}
          selected={budgetSel}
          onChange={setBudgetSel}
        />
        <button type="button" onClick={exportCsv} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-100">
          ⬇ CSV
        </button>
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
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
        >
          ＋ New category
        </button>
      </div>

      {/* Mobile: card rows */}
      <div className="space-y-2 md:hidden">
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-stone-200 bg-white px-4 py-10 text-center text-sm text-stone-400">
            {data.length === 0 ? "No categories yet — add one above." : "Nothing matches these filters."}
          </p>
        ) : (
          filtered.map((r) => (
            <div key={r.id} className="rounded-xl border border-stone-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <EmojiCell value={r.icon} onCommit={(v) => setIcon(r.id, v)} />
                <div className="min-w-0 flex-1">
                  <NameCell value={r.name} onCommit={(v) => rename(r.id, v)} />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(r)}
                  className="rounded-lg px-2 py-1.5 text-sm text-stone-300 hover:bg-red-50 hover:text-red-600"
                  title="Delete category"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setKind(r.id, r.kind === "income" ? "expense" : "income")}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    r.kind === "income" ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {r.kind}
                </button>
                {r.kind === "expense" && (
                  <BudgetCell value={r.budget} onCommit={(n) => setBudget(r.id, n)} fmt={fmt} />
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop: the smart-sheet table */}
      <div className="hidden overflow-x-auto rounded-xl border border-stone-200 bg-white md:block">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-stone-400">
            {data.length === 0 ? "No categories yet — add one with ＋ New category." : "Nothing matches these filters."}
          </p>
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
              {filtered.map((r, i) => (
                <tr key={r.id} className={`border-b border-stone-100 ${i % 2 ? "bg-stone-50" : ""}`}>
                  {orderedCols.map((c) => renderTd(r, c))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-200 bg-stone-50 text-xs font-medium">
                <td colSpan={orderedCols.length} className="px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-stone-500">
                      {totals.n} categor{totals.n === 1 ? "y" : "ies"}
                      <span className="text-stone-400"> · {totals.expense} expense · {totals.income} income</span>
                    </span>
                    <span className="tabular-nums text-stone-600">
                      budgeted {fmt(totals.budgeted)}/mo
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {showNew && (
        <NewCategoryModal
          onClose={() => setShowNew(false)}
          onCreated={(c) => {
            setData((d) => [...d, { ...c, budget: null }]);
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
}

function NewCategoryModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: Cat) => void;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [custom, setCustom] = useState("");
  const [kind, setKind] = useState("expense");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await createCategoryInline(name, custom.trim() || icon, kind);
    setBusy(false);
    if (!res.ok || !res.category) {
      setError(res.error ?? "Could not create category");
      return;
    }
    onCreated(res.category as Cat);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">＋ New category</h2>
        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Pets"
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && !busy) save(); }}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Pick an emoji</label>
            <div className="flex flex-wrap gap-1">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    setIcon(e);
                    setCustom("");
                  }}
                  className={`rounded-lg border px-2 py-1 text-lg ${
                    icon === e && !custom ? "border-stone-900 ring-1 ring-stone-900" : "border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="…or type any emoji"
              className="mt-2 w-40 rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Kind</label>
            <div className="flex gap-2">
              {(["expense", "income"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`rounded-lg border px-3 py-1.5 text-sm capitalize ${
                    kind === k ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 hover:bg-stone-50"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={save}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
