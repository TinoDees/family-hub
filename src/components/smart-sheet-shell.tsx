"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * SmartSheetShell — the shared "chrome" for every Tracey data grid.
 *
 * The HOUSE STYLE lives here so a change updates the whole app at once: the dark
 * sticky header, the toolbar (search + segmented filters + column picker + CSV),
 * resizable + 3-state-sortable headers, optional section bands, a totals footer,
 * column-width + hidden persistence, row click, and below-threshold row tints.
 *
 * The shell owns the chrome; the PAGE owns the cells. Each column supplies a
 * `render(row)` (any JSX — including editable inputs for live grids) and an
 * optional `sortValue(row)`. That hybrid keeps every grid visually identical
 * without forcing custom cells (the WPS trios, GST selectors, etc.) into a
 * rigid generic mould. See the smart-sheet skill for the cell recipe.
 */

import { useIsMobile } from "@/lib/hooks/use-is-mobile";

export type SheetColumn<R> = {
  key: string;
  label: string;
  /** Default width in px (user can resize; persisted). */
  width: number;
  align?: "left" | "right" | "center";
  /** Sortable header. Provide sortValue for correct ordering. */
  sortable?: boolean;
  sortValue?: (row: R) => string | number;
  /** Cell body — any JSX. For live grids, return an input here. */
  render: (row: R) => React.ReactNode;
  /** Group id for section bands + the column picker. */
  group?: string;
  /** Hidden until the user opts in via the column picker. */
  defaultHidden?: boolean;
  /** Plain text for CSV export (falls back to "" ). */
  csv?: (row: R) => string | number | null | undefined;
  /** Show a per-column text filter input under the header. */
  filterable?: boolean;
  /** Text matched by the per-column filter (defaults to csv()). */
  filterText?: (row: R) => string;
};

export type RowAction = {
  label: string;
  /** Short helper line under the label. */
  description?: string;
  icon?: React.ReactNode;
  /** Accent colour for the icon badge + left stripe (default Tracey blue). */
  accent?: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
};

export type SegmentedFilter<R> = {
  id: string;
  label: string;
  /** For single-select: the options; FIRST is the default ("all"). For
   *  multi-select (multi:true): the selectable values — do NOT include an
   *  "all" sentinel (empty selection = no filter). */
  options: { value: string; label: string }[];
  /** Keep the row when an active option is `value`. For multi filters this is
   *  called once per selected value and the row is kept if ANY match (OR). */
  match: (row: R, value: string) => boolean;
  /** Render a checkbox-dropdown that selects many values at once (OR). */
  multi?: boolean;
};

export type SectionDef = { id: string; label: string; accent?: string };

const HOUSE = {
  headerBg: "#1e293b",     // dark slate — the standard grid header
  headerActive: "#2563eb", // active-sort header
  headerText: "#ffffff",
  bandText: "#e2e8f0",
  border: "#e7e5e4",
  zebra: "#fafaf9",
  rowText: "#1c1917",
  toolbarBtn: "#fff",
  chipActive: "#1e3a8a",
};

const EMPTY_LIST: unknown[] = [];

const ctrl: React.CSSProperties = {
  padding: "0.3rem 0.55rem", fontSize: "0.8rem", border: "1px solid #d6d3d1",
  borderRadius: "0.375rem", background: "#fff", color: "#1c1917",
};

export function SmartSheetShell<R>({
  rows, columns, getRowId, storageKey,
  searchText, searchPlaceholder = "Search…",
  filters = EMPTY_LIST as unknown as SegmentedFilter<R>[], sections = EMPTY_LIST as unknown as SectionDef[], totals,
  onRowClick, rowStyle, dense = true, csvFilename = "export",
  rightToolbar, onView, maxHeight, fill, hideToolbar, hiddenColumns, onHiddenChange, rowActions, rowActionsTitle, rowActionsButton, initialSort, initialFilters,
}: {
  rows: R[];
  columns: SheetColumn<R>[];
  getRowId: (row: R) => string;
  /** Unique key for persisting widths + hidden columns in localStorage. */
  storageKey: string;
  /** Text used to match the search box (joined, lower-cased internally). */
  searchText?: (row: R) => string;
  searchPlaceholder?: string;
  filters?: SegmentedFilter<R>[];
  sections?: SectionDef[];
  /** Footer values keyed by column key. Omit to hide the footer. */
  totals?: (rows: R[]) => Partial<Record<string, React.ReactNode>>;
  onRowClick?: (row: R) => void;
  rowStyle?: (row: R) => React.CSSProperties | undefined;
  dense?: boolean;
  csvFilename?: string;
  /** Extra controls dropped at the right of the toolbar (e.g. a date range). */
  rightToolbar?: React.ReactNode;
  /** Called with the current filtered + sorted view (for summary cards). */
  onView?: (rows: R[]) => void;
  /** Cap the table height so it becomes a scroll viewport — keeps the sticky
   *  header AND the horizontal scrollbar reachable on wide grids. */
  maxHeight?: string;
  /** Fill the parent (flex:1) instead of capping height — for a fixed page
   *  header with only the table scrolling. */
  fill?: boolean;
  /** Hide the built-in toolbar so the page can render Columns/CSV in its header. */
  hideToolbar?: boolean;
  /** Controlled hidden-columns set (pair with onHiddenChange). */
  hiddenColumns?: Set<string>;
  onHiddenChange?: (next: Set<string>) => void;
  /** Click a row to open a simple modal of these actions (saves a per-row
   *  Actions column, and works on touch). */
  rowActions?: (row: R) => RowAction[];
  rowActionsTitle?: (row: R) => React.ReactNode;
  /** Show an explicit inline "Actions" button (trailing column) to open the
   *  actions modal, instead of making the whole row clickable. */
  rowActionsButton?: boolean;
  /** Default sort applied on first render (user can still change it). */
  initialSort?: { k: string; dir: "asc" | "desc" }[];
  /** Pre-select segmented-filter values on first render, keyed by filter id
   *  (user can still change them). Useful for deep-links from the dashboard. */
  initialFilters?: Record<string, string>;
}) {
  const WKEY = `ss:${storageKey}:w`;
  const HKEY = `ss:${storageKey}:hidden`;
  const OKEY = `ss:${storageKey}:order`;

  const [widths, setWidths] = useState<Record<string, number>>(
    () => Object.fromEntries(columns.map((c) => [c.key, c.width])),
  );
  const [internalHidden, setInternalHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)),
  );
  const hidden = hiddenColumns ?? internalHidden;
  const [q, setQ] = useState("");
  const isMobile = useIsMobile(640);
  const [seg, setSeg] = useState<Record<string, string>>(
    () => Object.fromEntries(filters.map((f) => [f.id, initialFilters?.[f.id] ?? f.options[0]?.value ?? "all"])),
  );
  // Multi-select filter state: id -> set of chosen values. Empty = no filter.
  const [multiSel, setMultiSel] = useState<Record<string, Set<string>>>(
    () => Object.fromEntries(
      filters.filter((f) => f.multi).map((f) => [
        f.id,
        new Set<string>(initialFilters?.[f.id] ? initialFilters[f.id].split(",").map((x) => x.trim()).filter(Boolean) : []),
      ]),
    ),
  );
  const [sortSpec, setSortSpec] = useState<{ k: string; dir: "asc" | "desc" }[]>(initialSort ?? []);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const onViewRef = useRef(onView);
  onViewRef.current = onView;
  const lastViewSig = useRef<string | null>(null);
  const [actionRow, setActionRow] = useState<R | null>(null);
  const [colOrder, setColOrder] = useState<string[]>([]);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  useEffect(() => {
    try { const r = localStorage.getItem(WKEY); if (r) setWidths((w) => ({ ...w, ...JSON.parse(r) })); } catch { /* ignore */ }
    try { const r = localStorage.getItem(HKEY); if (r && !hiddenColumns) setInternalHidden(new Set(JSON.parse(r))); } catch { /* ignore */ }
    try { const r = localStorage.getItem(OKEY); if (r) { const a = JSON.parse(r); if (Array.isArray(a)) setColOrder(a as string[]); } } catch { /* ignore */ }
  }, [WKEY, HKEY, OKEY]);

  function saveW(k: string, w: number) {
    setWidths((prev) => {
      const nx = { ...prev, [k]: Math.max(46, Math.round(w)) };
      try { localStorage.setItem(WKEY, JSON.stringify(nx)); } catch { /* ignore */ }
      return nx;
    });
  }
  function setHiddenP(next: Set<string>) {
    if (onHiddenChange) { onHiddenChange(next); return; }
    setInternalHidden(next);
    try { localStorage.setItem(HKEY, JSON.stringify([...next])); } catch { /* ignore */ }
  }

  const orderedColumns = colOrder.length
    ? [...columns].sort((a, b) => {
        const ai = colOrder.indexOf(a.key), bi = colOrder.indexOf(b.key);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
    : columns;
  function reorderCols(srcKey: string, destKey: string) {
    if (srcKey === destKey) return;
    const keys = orderedColumns.map((c) => c.key);
    const from = keys.indexOf(srcKey);
    if (from === -1) return;
    keys.splice(from, 1);
    const to = keys.indexOf(destKey);
    keys.splice(to === -1 ? keys.length : to, 0, srcKey);
    setColOrder(keys);
    setDragKey(null); setDragOverKey(null);
    try { localStorage.setItem(OKEY, JSON.stringify(keys)); } catch { /* ignore */ }
  }
  const baseShown = orderedColumns.filter((c) => !hidden.has(c.key));
  const actionsCol: SheetColumn<R> = {
    key: "__rowactions", label: "", width: 104, align: "center", sortable: false,
    render: (r) => (
      <button onClick={(e) => { e.stopPropagation(); setActionRow(r); }} title="Actions"
        style={{ ...ctrl, cursor: "pointer", padding: "0.2rem 0.55rem", fontSize: "0.72rem", fontWeight: 700, color: "#1e3a8a", borderColor: "#1e3a8a", whiteSpace: "nowrap" }}>
        Actions ▾
      </button>
    ),
    csv: () => "",
  };
  const shown = (rowActions && rowActionsButton) ? [...baseShown, actionsCol] : baseShown;

  const onSort = (k: string, additive: boolean) =>
    setSortSpec((prev) => {
      const idx = prev.findIndex((x) => x.k === k);
      if (additive) {
        if (idx === -1) return [...prev, { k, dir: "asc" as const }];
        if (prev[idx].dir === "asc") { const n = [...prev]; n[idx] = { k, dir: "desc" }; return n; }
        return prev.filter((x) => x.k !== k);
      }
      if (prev.length === 1 && idx === 0) return prev[0].dir === "asc" ? [{ k, dir: "desc" as const }] : [];
      return [{ k, dir: "asc" as const }];
    });

  const view = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const activeColFilters = columns.filter((c) => c.filterable && (colFilters[c.key] ?? "").trim() !== "");
    let out = rows.filter((r) => {
      if (ql && searchText && !searchText(r).toLowerCase().includes(ql)) return false;
      for (const f of filters) {
        if (f.multi) {
          const sel = multiSel[f.id];
          if (sel && sel.size > 0) {
            let ok = false;
            for (const val of sel) { if (f.match(r, val)) { ok = true; break; } }
            if (!ok) return false;
          }
        } else {
          const v = seg[f.id] ?? f.options[0]?.value;
          if (v && v !== (f.options[0]?.value ?? "all") && !f.match(r, v)) return false;
        }
      }
      for (const c of activeColFilters) {
        const needle = colFilters[c.key].trim().toLowerCase();
        const hay = (c.filterText ? c.filterText(r) : String(c.csv ? c.csv(r) ?? "" : "")).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    if (sortSpec.length) {
      out = [...out].sort((a, b) => {
        for (const sp of sortSpec) {
          const col = columns.find((c) => c.key === sp.k);
          const val = col?.sortValue ?? (() => 0);
          const av = val(a), bv = val(b);
          const c = typeof av === "number" && typeof bv === "number"
            ? av - bv : String(av).toLowerCase().localeCompare(String(bv).toLowerCase());
          if (c !== 0) return sp.dir === "asc" ? c : -c;
        }
        return 0;
      });
    }
    return out;
  }, [rows, q, seg, multiSel, sortSpec, colFilters, filters, columns, searchText]);

  const footer = totals ? totals(view) : null;
  // Emit the current view to the parent ONLY when its content actually changes.
  // `view` is a fresh array on every render (columns/filters/searchText props are
  // often inline = new refs each render), so firing onView on every reference
  // change creates an infinite render loop when the parent stores it in state
  // (onView -> setState -> re-render -> new view ref -> ...). Compare by row-id
  // signature so onView fires once per real change and the loop can't form.
  useEffect(() => {
    if (!onViewRef.current) return;
    const sig = view.length + "|" + view.map(getRowId).join("|");
    if (sig === lastViewSig.current) return;
    lastViewSig.current = sig;
    onViewRef.current(view);
  }, [view, getRowId]);
  useEffect(() => {
    if (!actionRow) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setActionRow(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [actionRow]);

  // Section bands across contiguous same-group runs of the shown columns.
  const bands = useMemo(() => {
    const secOf = (id?: string) => sections.find((s) => s.id === id);
    const out: { label: string; accent?: string; span: number }[] = [];
    for (const c of shown) {
      const s = secOf(c.group);
      const last = out[out.length - 1];
      if (last && last.label === (s?.label ?? "")) last.span++;
      else out.push({ label: s?.label ?? "", accent: s?.accent, span: 1 });
    }
    return out;
  }, [shown, sections]);
  const hasBands = sections.length > 0;

  function exportCsv() {
    const esc = (s: string) => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
    const lines = [shown.map((c) => esc(c.label)).join(",")];
    view.forEach((r) => lines.push(shown.map((c) => {
      const v = c.csv ? c.csv(r) : undefined;
      return esc(v == null ? "" : String(v));
    }).join(",")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${csvFilename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const pad = dense ? "0.3rem 0.55rem" : "0.5rem 0.7rem";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", ...(fill ? { flex: 1, minHeight: 0 } : {}) }}>
      {/* Toolbar */}
      {!hideToolbar && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        {searchText && (
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder}
            style={{ ...ctrl, minWidth: 180, ...(isMobile ? { flexBasis: "100%" } : {}) }} />
        )}
        {filters.map((f) => f.multi ? (
          <FilterMulti key={f.id} filter={f} selected={multiSel[f.id] ?? new Set()}
            onChange={(next) => setMultiSel((s) => ({ ...s, [f.id]: next }))} />
        ) : (
          <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#78716c", whiteSpace: "nowrap" }}>{f.label}</span>
            <select value={seg[f.id]} onChange={(e) => setSeg((s) => ({ ...s, [f.id]: e.target.value }))} style={ctrl} aria-label={f.label}>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </span>
        ))}
        {isMobile && shown.some((c) => c.sortable) && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            <select value={sortSpec[0]?.k ?? ""} onChange={(e) => setSortSpec(e.target.value ? [{ k: e.target.value, dir: "asc" }] : [])} style={ctrl} aria-label="Sort by">
              <option value="">Sort…</option>
              {shown.filter((c) => c.sortable).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            {sortSpec[0] && <button onClick={() => setSortSpec((prev) => prev[0] ? [{ k: prev[0].k, dir: prev[0].dir === "asc" ? "desc" : "asc" }] : [])} style={{ ...ctrl, cursor: "pointer" }} aria-label="Toggle sort direction">{sortSpec[0].dir === "asc" ? "▲" : "▼"}</button>}
          </span>
        )}
        <ColumnsMenu columns={columns} hidden={hidden} onChange={setHiddenP} />
        <button onClick={exportCsv} style={{ ...ctrl, cursor: "pointer" }}>⬇ CSV</button>
        {rightToolbar}
        <span style={{ marginLeft: "auto", fontSize: "0.78rem", color: "#78716c" }}>{view.length} of {rows.length}</span>
      </div>
      )}

      {/* Mobile: phone-first card list. Desktop: the dense table. */}
      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {view.length === 0 ? (
            <div style={{ padding: "1.5rem", textAlign: "center", color: "#a8a29e", border: `1px solid ${HOUSE.border}`, borderRadius: "0.6rem" }}>No rows match.</div>
          ) : view.map((r) => {
            const rid = getRowId(r);
            const custom = rowStyle?.(r);
            const [titleCol, ...restCols] = shown;
            return (
              <div key={rid} onClick={(rowActions && !rowActionsButton) ? () => setActionRow(r) : onRowClick ? () => onRowClick(r) : undefined}
                style={{ border: `1px solid ${HOUSE.border}`, borderRadius: "0.6rem", background: custom?.background ?? "#fff", padding: "0.7rem 0.85rem", cursor: ((rowActions && !rowActionsButton) || onRowClick) ? "pointer" : "default", ...custom }}>
                {titleCol && <div style={{ fontWeight: 700, fontSize: "0.92rem", marginBottom: "0.35rem", color: HOUSE.rowText }}>{titleCol.render(r)}</div>}
                {restCols.map((c) => (
                  <div key={c.key} style={{ display: "flex", justifyContent: "space-between", gap: "0.7rem", padding: "0.18rem 0", borderTop: "1px solid #f5f5f4" }}>
                    <span style={{ color: "#9AA2AC", fontWeight: 600, fontSize: "0.64rem", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{c.label}</span>
                    <span style={{ textAlign: "right", color: HOUSE.rowText, minWidth: 0 }}>{c.render(r)}</span>
                  </div>
                ))}
                {((rowActions && !rowActionsButton) || onRowClick) && <div style={{ marginTop: "0.4rem", fontSize: "0.72rem", color: "#1e3a8a", fontWeight: 600 }}>Tap for details ›</div>}
              </div>
            );
          })}
          {footer && view.length > 0 && (
            <div style={{ border: "1px solid #cbd5e1", background: "#f1f5f9", borderRadius: "0.6rem", padding: "0.6rem 0.85rem", fontWeight: 700, fontSize: "0.82rem" }}>
              {shown.filter((c) => footer[c.key] != null).map((c) => (
                <div key={c.key} style={{ display: "flex", justifyContent: "space-between", gap: "0.7rem", padding: "0.1rem 0" }}>
                  <span style={{ color: "#64748b", fontSize: "0.7rem", textTransform: "uppercase" }}>{c.label}</span>
                  <span>{footer[c.key]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
      <div style={{ overflow: "auto", border: `1px solid ${HOUSE.border}`, borderRadius: "0.5rem", ...(fill ? { flex: 1, minHeight: 0 } : { maxHeight }) }}>
        <table style={{ tableLayout: "fixed", borderCollapse: "collapse", width: "max-content", minWidth: "100%", fontSize: "0.78rem" }}>
          <colgroup>{shown.map((c) => <col key={c.key} style={{ width: widths[c.key] ?? c.width }} />)}</colgroup>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            {hasBands && (
              <tr>
                {bands.map((b, i) => (
                  <th key={i} colSpan={b.span} style={{ background: b.accent ?? HOUSE.headerBg, color: HOUSE.bandText, fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "center", padding: "0.12rem 0", borderRight: "2px solid rgba(255,255,255,0.18)" }}>{b.label}</th>
                ))}
              </tr>
            )}
            <tr>
              {shown.map((c) => {
                const sIdx = sortSpec.findIndex((sp) => sp.k === c.key);
                const active = sIdx >= 0;
                const priority = active && sortSpec.length > 1 ? sIdx + 1 : null;
                return (
                  <th key={c.key} onClick={(e) => c.sortable && onSort(c.key, e.ctrlKey || e.metaKey)}
                    title={c.sortable ? "Click to sort · Ctrl+click to add a sub-sort" : undefined}
                    onDragOver={dragKey ? (e) => { e.preventDefault(); if (dragOverKey !== c.key) setDragOverKey(c.key); } : undefined}
                    onDragLeave={() => { if (dragOverKey === c.key) setDragOverKey(null); }}
                    onDrop={dragKey ? (e) => { e.preventDefault(); reorderCols(dragKey, c.key); } : undefined}
                    style={{ position: "relative", padding: "0.35rem 0.55rem", textAlign: c.align ?? "left", color: HOUSE.headerText, background: active ? HOUSE.headerActive : HOUSE.headerBg, cursor: c.sortable ? "pointer" : "default", whiteSpace: "nowrap", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", overflow: "hidden", boxShadow: dragOverKey === c.key && dragKey && dragKey !== c.key ? "inset 3px 0 0 #60a5fa" : undefined }}>
                    <span draggable onDragStart={(e) => { e.stopPropagation(); setDragKey(c.key); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setDragKey(null); setDragOverKey(null); }} onClick={(e) => e.stopPropagation()} title="Drag to reorder this column" style={{ cursor: "grab", color: "#64748b", marginRight: "0.25rem" }}>⠿</span>
                    {c.label}{active ? (sortSpec[sIdx].dir === "asc" ? " ▲" : " ▼") : ""}{priority != null ? <sup style={{ fontSize: "0.55rem" }}>{priority}</sup> : null}
                    <span onMouseDown={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      const sx = e.clientX, sw = widths[c.key] ?? c.width;
                      const mv = (ev: MouseEvent) => saveW(c.key, sw + (ev.clientX - sx));
                      const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
                      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
                    }} onClick={(e) => e.stopPropagation()}
                      style={{ position: "absolute", top: 0, right: 0, width: 9, height: "100%", cursor: "col-resize", zIndex: 3 }} />
                  </th>
                );
              })}
            </tr>
            {columns.some((c) => c.filterable) && (
              <tr>
                {shown.map((c) => (
                  <th key={c.key} style={{ padding: "2px 4px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    {c.filterable ? (
                      <input value={colFilters[c.key] ?? ""} onChange={(e) => setColFilters((p) => ({ ...p, [c.key]: e.target.value }))}
                        placeholder="filter…" onClick={(e) => e.stopPropagation()}
                        style={{ width: "100%", boxSizing: "border-box", fontSize: "0.68rem", padding: "2px 4px", border: "1px solid #cbd5e1", borderRadius: 3, background: (colFilters[c.key] ?? "") ? "#fef9c3" : "#fff" }} />
                    ) : null}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {view.length === 0 ? (
              <tr><td colSpan={shown.length} style={{ padding: "1.5rem", textAlign: "center", color: "#a8a29e" }}>No rows match.</td></tr>
            ) : view.map((r, i) => {
              const rid = getRowId(r);
              const custom = rowStyle?.(r);
              return (
                <tr key={rid} onClick={(rowActions && !rowActionsButton) ? () => setActionRow(r) : onRowClick ? () => onRowClick(r) : undefined}
                  style={{ background: custom?.background ?? (i % 2 ? HOUSE.zebra : "#fff"), cursor: ((rowActions && !rowActionsButton) || onRowClick) ? "pointer" : "default", ...custom }}>
                  {shown.map((c) => (
                    <td key={c.key} style={{ padding: pad, textAlign: c.align ?? "left", borderBottom: "1px solid #f5f5f4", color: HOUSE.rowText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {footer && view.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                {shown.map((c, idx) => (
                  <td key={c.key} style={{ padding: pad, textAlign: c.align ?? "left", borderTop: "2px solid #cbd5e1", background: "#f1f5f9", whiteSpace: "nowrap" }}>
                    {idx === 0 && footer[c.key] == null ? "Total" : footer[c.key] ?? ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      )}
      {actionRow && rowActions ? (
        <div onClick={() => setActionRow(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "0.6rem", minWidth: 260, maxWidth: "min(92vw, 380px)", boxShadow: "0 20px 50px rgba(0,0,0,0.3)", overflow: "hidden" }}>
            <div style={{ padding: "0.7rem 0.9rem", borderBottom: "1px solid #e7e5e4", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rowActionsTitle ? rowActionsTitle(actionRow) : "Actions"}</div>
              <button onClick={() => setActionRow(null)} aria-label="Close" style={{ background: "none", border: "none", fontSize: "1rem", cursor: "pointer", color: "#78716c", lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: "0.6rem", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              {rowActions(actionRow).map((a, i) => {
                const accent = a.disabled ? "#94a3b8" : a.tone === "danger" ? "#b91c1c" : (a.accent ?? "#1e3a8a");
                return (
                  <button key={i} disabled={a.disabled} onClick={() => { if (!a.disabled) { a.onClick(); setActionRow(null); } }}
                    style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "0.7rem", padding: "0.65rem 0.75rem", border: "1px solid #e2e8f0", borderLeft: `3px solid ${accent}`, borderRadius: "0.5rem", background: "#fff", cursor: a.disabled ? "not-allowed" : "pointer", opacity: a.disabled ? 0.6 : 1, transition: "background 0.12s, border-color 0.12s" }}
                    onMouseEnter={(e) => { if (!a.disabled) { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.borderLeftColor = accent; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.borderLeftColor = accent; }}>
                    {a.icon ? <span aria-hidden style={{ width: 34, height: 34, flexShrink: 0, borderRadius: "50%", background: accent + "18", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "1.05rem" }}>{a.icon}</span> : null}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: "0.88rem", fontWeight: 600, color: a.disabled ? "#94a3b8" : "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
                      {a.description ? <span style={{ display: "block", fontSize: "0.72rem", color: "#78716c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.description}</span> : null}
                    </span>
                    <span aria-hidden style={{ color: "#cbd5e1", fontSize: "1.15rem", flexShrink: 0 }}>›</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FilterMulti({ filter, selected, onChange }: {
  filter: { id: string; label: string; options: { value: string; label: string }[] };
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const count = selected.size;
  const toggle = (v: string) => {
    const n = new Set(selected); if (n.has(v)) n.delete(v); else n.add(v); onChange(n);
  };
  const label = count === 0 ? "All" : count === 1 ? (filter.options.find((o) => selected.has(o.value))?.label ?? "1") : `${count} selected`;
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
      <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#78716c", whiteSpace: "nowrap" }}>{filter.label}</span>
      <button onClick={() => setOpen((o) => !o)} aria-label={filter.label}
        style={{ ...ctrl, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.35rem", borderColor: count ? "#1e3a8a" : "#d6d3d1", color: count ? "#1e3a8a" : "#1c1917", fontWeight: count ? 700 : 400, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        <span style={{ fontSize: "0.6rem" }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 60, background: "#fff", border: "1px solid #d6d3d1", borderRadius: "0.5rem", boxShadow: "0 6px 20px rgba(0,0,0,0.15)", padding: "0.5rem", width: 230, maxHeight: "60vh", overflowY: "auto" }}>
          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem" }}>
            <button onClick={() => onChange(new Set())} style={{ ...ctrl, flex: 1, fontSize: "0.7rem", cursor: "pointer" }}>Clear</button>
            <button onClick={() => onChange(new Set(filter.options.map((o) => o.value)))} style={{ ...ctrl, flex: 1, fontSize: "0.7rem", cursor: "pointer" }}>Select all</button>
          </div>
          {filter.options.length === 0 ? (
            <div style={{ fontSize: "0.75rem", color: "#a8a29e", padding: "0.25rem" }}>No options</div>
          ) : filter.options.map((o) => (
            <label key={o.value} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.15rem 0.25rem", fontSize: "0.8rem", cursor: "pointer" }}>
              <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function ColumnsMenu({ columns, hidden, onChange }: {
  columns: { key: string; label: string }[];
  hidden: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ ...ctrl, cursor: "pointer" }}>Columns ▾</button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 60, background: "#fff", border: "1px solid #d6d3d1", borderRadius: "0.5rem", boxShadow: "0 6px 20px rgba(0,0,0,0.15)", padding: "0.5rem", width: 220, maxHeight: "70vh", overflowY: "auto" }}>
          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem" }}>
            <button onClick={() => onChange(new Set())} style={{ ...ctrl, flex: 1, fontSize: "0.7rem", cursor: "pointer" }}>Show all</button>
            <button onClick={() => onChange(new Set(columns.map((c) => c.key)))} style={{ ...ctrl, flex: 1, fontSize: "0.7rem", cursor: "pointer" }}>Hide all</button>
          </div>
          {columns.map((c) => (
            <label key={c.key} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.15rem 0.25rem", fontSize: "0.8rem", cursor: "pointer" }}>
              <input type="checkbox" checked={!hidden.has(c.key)} onChange={(e) => {
                const nx = new Set(hidden); if (e.target.checked) nx.delete(c.key); else nx.add(c.key); onChange(nx);
              }} />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default SmartSheetShell;
