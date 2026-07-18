"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  createRuleInline,
  updateRuleInline,
  deleteRuleInline,
} from "@/lib/actions/rules";
import { CategorySelect } from "@/components/category-select";
import type { NewCat } from "@/components/category-modal";

type Cat = { id: string; name: string; icon: string | null; kind: string };
type Row = {
  id: string;
  match_text: string;
  match_field: "any" | "description" | "merchant";
  category_id: string;
  enabled: boolean;
  created_at: string;
};
type SortKey = "match" | "field" | "category" | "created";
type SortDir = "asc" | "desc";

type ColDef = {
  key: SortKey | "enabled" | "actions";
  label: string;
  width?: number;
  minWidth: number;
  align: "left" | "right";
  sortable: boolean;
  movable: boolean;
};

const FIELD_LABEL: Record<string, string> = {
  any: "Description or merchant",
  description: "Description only",
  merchant: "Merchant only",
};

// ── MultiSelectFilter — the house checkbox popover ───────────────────────────

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
        <div className="absolute left-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
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

/** Text cell — local string while focused, commit on blur/Enter. */
function MatchCell({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [s, setS] = useState(value);
  useEffect(() => setS(value), [value]);
  const commit = () => {
    const clean = s.trim();
    if (clean.length >= 2 && clean !== value) onCommit(clean);
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

const selectCls =
  "w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none";

export function RulesGrid({
  rules,
  categories,
  storageKey = "rules",
}: {
  rules: Row[];
  categories: Cat[];
  storageKey?: string;
}) {
  const [data, setData] = useState<Row[]>(rules);
  useEffect(() => setData(rules), [rules]);
  // categories are stateful so a category created inline (from the rule modal)
  // shows up in every select straight away
  const [cats, setCatsState] = useState<Cat[]>(categories);
  useEffect(() => setCatsState(categories), [categories]);
  const addCat = (c: NewCat) =>
    setCatsState((p) =>
      [...p, c].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
    );

  const [q, setQ] = useState("");
  const [fieldSel, setFieldSel] = useState<Set<string>>(new Set());
  const [stateSel, setStateSel] = useState<Set<string>>(new Set());
  const [sortSpec, setSortSpec] = useState<{ key: SortKey; dir: SortDir }[]>([
    { key: "created", dir: "desc" },
  ]);
  const [msg, setMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [, startTransition] = useTransition();

  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const catLabel = (id: string) => {
    const c = catById.get(id);
    return c ? `${c.icon ?? "🏷️"} ${c.name}` : "—";
  };

  // ── Column layout persistence (house kit) ──────────────────────────────────
  const lsPrefix = `rulegrid.${storageKey}`;
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
        if (Array.isArray(parsed)) setColOrder(parsed.filter((k): k is string => typeof k === "string"));
      }
    } catch { /* corrupted layout never breaks the grid */ }
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
      { key: "enabled", label: "On", width: 64, minWidth: 54, align: "left", sortable: false, movable: true },
      { key: "match", label: "Contains", minWidth: 140, align: "left", sortable: true, movable: true },
      { key: "field", label: "Looks at", width: 190, minWidth: 120, align: "left", sortable: true, movable: true },
      { key: "category", label: "Allocates category", width: 220, minWidth: 130, align: "left", sortable: true, movable: true },
      { key: "created", label: "Added", width: 110, minWidth: 80, align: "left", sortable: true, movable: true },
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
    return [...cols, { key: "actions", label: "", width: 56, minWidth: 50, align: "right", sortable: false, movable: false } as ColDef];
  }, [baseCols, colOrder]);

  function reorderCols(srcKey: string, destKey: string) {
    if (srcKey === destKey) { setDragKey(null); setDragOverKey(null); return; }
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

  // ── Mutations — optimistic with rollback ───────────────────────────────────

  const patchRow = (id: string, patch: Partial<Row>) => {
    const prev = data;
    setData((d) => d.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    startTransition(async () => {
      const res = await updateRuleInline(id, patch);
      if (!res.ok) {
        setData(prev);
        setMsg(res.error ?? "Could not save the rule");
      } else if (res.applied && res.applied > 0) {
        setNotice(`Rule saved — suggested its category on ${res.applied} unsorted transaction${res.applied === 1 ? "" : "s"}.`);
      }
    });
  };

  const removeRow = (row: Row) => {
    if (!window.confirm(`Delete this rule ("${row.match_text}")? Already-sorted transactions keep their categories.`)) return;
    const prev = data;
    setData((d) => d.filter((r) => r.id !== row.id));
    startTransition(async () => {
      const res = await deleteRuleInline(row.id);
      if (!res.ok) {
        setData(prev);
        setMsg(res.error ?? "Could not delete the rule");
      }
    });
  };

  // ── Filter + sort ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = data.filter((r) => {
      if (needle && !`${r.match_text} ${catById.get(r.category_id)?.name ?? ""}`.toLowerCase().includes(needle)) return false;
      if (fieldSel.size > 0 && !fieldSel.has(r.match_field)) return false;
      if (stateSel.size > 0 && !stateSel.has(r.enabled ? "on" : "off")) return false;
      return true;
    });
    if (sortSpec.length === 0) return list;
    const val = (r: Row, k: SortKey): string | number => {
      switch (k) {
        case "match": return r.match_text.toLowerCase();
        case "field": return r.match_field;
        case "category": return catById.get(r.category_id)?.name.toLowerCase() ?? "";
        case "created": return r.created_at;
      }
    };
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
  }, [data, q, fieldSel, stateSel, sortSpec, catById]);

  const totals = useMemo(() => {
    const on = filtered.filter((r) => r.enabled).length;
    return { n: filtered.length, on, off: filtered.length - on };
  }, [filtered]);

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
    const esc = (s: string) => (/[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s);
    const head = "Contains,Looks at,Category,Enabled,Added";
    const lines = filtered.map((r) =>
      [
        esc(r.match_text),
        FIELD_LABEL[r.match_field],
        esc(catById.get(r.category_id)?.name ?? ""),
        r.enabled ? "yes" : "no",
        r.created_at.slice(0, 10),
      ].join(",")
    );
    const blob = new Blob(["﻿" + [head, ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nestly-rule-book.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });

  // ── Header cell (house kit) ────────────────────────────────────────────────

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
        } ${col.sortable ? "cursor-pointer hover:bg-stone-800" : ""} ${isSorted ? "text-sky-300" : ""}`}
        style={{
          boxShadow:
            dragOverKey === col.key && dragKey && dragKey !== col.key ? "inset 3px 0 0 #2563eb" : undefined,
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
                <sup style={{ fontSize: "0.55rem", fontWeight: 800, marginLeft: "1px", verticalAlign: "super" }}>
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
            if (bar) { bar.style.background = "#5eead4"; bar.style.width = "3px"; }
          }}
          onMouseLeave={(e) => {
            const bar = e.currentTarget.firstElementChild as HTMLElement | null;
            if (bar) { bar.style.background = "rgba(255,255,255,0.28)"; bar.style.width = "1px"; }
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

  // ── Body cells ─────────────────────────────────────────────────────────────

  const renderTd = (r: Row, col: ColDef) => {
    switch (col.key) {
      case "enabled":
        return (
          <td key={col.key} className="px-3 py-1.5">
            <button
              type="button"
              onClick={() => patchRow(r.id, { enabled: !r.enabled })}
              title={r.enabled ? "Rule is on — click to pause it" : "Rule is paused — click to turn it on"}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                r.enabled ? "bg-teal-50 text-teal-700 hover:bg-teal-100" : "bg-stone-100 text-stone-400 hover:bg-stone-200"
              }`}
            >
              {r.enabled ? "On" : "Off"}
            </button>
          </td>
        );
      case "match":
        return (
          <td key={col.key} className="px-1 py-1.5">
            <MatchCell value={r.match_text} onCommit={(v) => patchRow(r.id, { match_text: v })} />
          </td>
        );
      case "field":
        return (
          <td key={col.key} className="px-1.5 py-1.5">
            <select
              value={r.match_field}
              onChange={(e) => patchRow(r.id, { match_field: e.target.value as Row["match_field"] })}
              className={selectCls}
            >
              <option value="any">Description or merchant</option>
              <option value="description">Description only</option>
              <option value="merchant">Merchant only</option>
            </select>
          </td>
        );
      case "category":
        return (
          <td key={col.key} className="px-1.5 py-1.5">
            <select
              value={r.category_id}
              onChange={(e) => patchRow(r.id, { category_id: e.target.value })}
              className={selectCls}
            >
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon ?? "🏷️"} {c.name}
                </option>
              ))}
            </select>
          </td>
        );
      case "created":
        return (
          <td key={col.key} className="overflow-hidden whitespace-nowrap px-3 py-1.5 text-stone-500">
            {fmtDate(r.created_at)}
          </td>
        );
      case "actions":
        return (
          <td key={col.key} className="whitespace-nowrap px-2 py-1.5 text-right">
            <button
              type="button"
              onClick={() => removeRow(r)}
              className="rounded px-1.5 py-1 text-xs text-stone-300 hover:bg-red-50 hover:text-red-600"
              title="Delete rule"
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
      {notice && (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-700">
          {notice}{" "}
          <button className="underline" onClick={() => setNotice(null)}>dismiss</button>
        </p>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Search rules…"
          className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm sm:w-auto sm:min-w-52 sm:flex-1"
        />
        <MultiSelectFilter
          label="Looks at"
          options={[
            { value: "any", label: "Description or merchant" },
            { value: "description", label: "Description only" },
            { value: "merchant", label: "Merchant only" },
          ]}
          selected={fieldSel}
          onChange={setFieldSel}
        />
        <MultiSelectFilter
          label="State"
          options={[
            { value: "on", label: "On" },
            { value: "off", label: "Paused" },
          ]}
          selected={stateSel}
          onChange={setStateSel}
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
          ＋ New rule
        </button>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-stone-200 bg-white px-4 py-10 text-center text-sm text-stone-400">
            {data.length === 0 ? "No rules yet — add one with ＋ New rule." : "Nothing matches these filters."}
          </p>
        ) : (
          filtered.map((r) => (
            <div key={r.id} className="rounded-xl border border-stone-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => patchRow(r.id, { enabled: !r.enabled })}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    r.enabled ? "bg-teal-50 text-teal-700" : "bg-stone-100 text-stone-400"
                  }`}
                >
                  {r.enabled ? "On" : "Off"}
                </button>
                <div className="min-w-0 flex-1">
                  <MatchCell value={r.match_text} onCommit={(v) => patchRow(r.id, { match_text: v })} />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(r)}
                  className="rounded-lg px-2 py-1.5 text-sm text-stone-300 hover:bg-red-50 hover:text-red-600"
                  title="Delete rule"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select
                  value={r.match_field}
                  onChange={(e) => patchRow(r.id, { match_field: e.target.value as Row["match_field"] })}
                  className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs"
                >
                  <option value="any">Description or merchant</option>
                  <option value="description">Description only</option>
                  <option value="merchant">Merchant only</option>
                </select>
                <select
                  value={r.category_id}
                  onChange={(e) => patchRow(r.id, { category_id: e.target.value })}
                  className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs"
                >
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon ?? "🏷️"} {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop smart-sheet */}
      <div className="hidden overflow-x-auto rounded-xl border border-stone-200 bg-white md:block">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-stone-400">
            {data.length === 0
              ? "No rules yet. Add one with ＋ New rule, or use the 📖 button on any transaction to start a rule from it."
              : "Nothing matches these filters."}
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
                <tr key={r.id} className={`border-b border-stone-100 ${i % 2 ? "bg-stone-50" : ""} ${r.enabled ? "" : "opacity-60"}`}>
                  {orderedCols.map((c) => renderTd(r, c))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-200 bg-stone-50 text-xs font-medium">
                <td colSpan={orderedCols.length} className="px-3 py-2">
                  <span className="text-stone-500">
                    {totals.n} rule{totals.n === 1 ? "" : "s"}
                    <span className="text-stone-400"> · {totals.on} on · {totals.off} paused</span>
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {showNew && (
        <NewRuleModal
          categories={cats}
          onCategoryCreated={addCat}
          onClose={() => setShowNew(false)}
          onCreated={(rule, applied) => {
            setData((d) => [rule, ...d]);
            setShowNew(false);
            if (applied > 0)
              setNotice(`Rule saved — suggested its category on ${applied} unsorted transaction${applied === 1 ? "" : "s"}.`);
          }}
        />
      )}
    </div>
  );
}

export function NewRuleModal({
  categories,
  initialText = "",
  initialCategoryId = "",
  onClose,
  onCreated,
  onCategoryCreated,
}: {
  categories: Cat[];
  initialText?: string;
  initialCategoryId?: string;
  onClose: () => void;
  onCreated: (rule: Row, applied: number) => void;
  /** Bubble up a category created inline so the caller's lists stay current. */
  onCategoryCreated?: (c: NewCat) => void;
}) {
  const [text, setText] = useState(initialText);
  const [field, setField] = useState("any");
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [localCats, setLocalCats] = useState<Cat[]>(categories);
  useEffect(() => setLocalCats(categories), [categories]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await createRuleInline(text, field, categoryId);
    setBusy(false);
    if (!res.ok || !res.rule) {
      setError(res.error ?? "Could not save the rule");
      return;
    }
    onCreated(res.rule as Row, res.applied ?? 0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">📖 New rule</h2>
        <p className="mt-1 text-xs text-stone-400">
          When a transaction arrives and contains this text, Nestly fills in the category — you just tick to confirm.
        </p>
        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium">Contains</label>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              placeholder="e.g. NOW FINANCE"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Looks at</label>
            <select
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
            >
              <option value="any">Description or merchant</option>
              <option value="description">Description only</option>
              <option value="merchant">Merchant only</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Allocates category</label>
            <CategorySelect
              categories={localCats}
              value={categoryId}
              onPick={setCategoryId}
              onCategoryCreated={(c) => {
                setLocalCats((p) =>
                  [...p, c].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
                );
                onCategoryCreated?.(c);
              }}
            />
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
            disabled={busy || text.trim().length < 2 || !categoryId}
            onClick={save}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save rule"}
          </button>
        </div>
      </div>
    </div>
  );
}
