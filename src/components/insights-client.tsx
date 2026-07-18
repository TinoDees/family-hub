"use client";

import { useMemo, useState } from "react";

/**
 * The Insights dashboard body. Everything is computed from one slim row set;
 * charts are inline SVG in the validated house pair — teal #0d9488 (income /
 * money put away) and amber #d97706 (spending / money drawn down) — with text
 * in stone ink, native tooltips on every mark, and a drill-in modal behind
 * every number that can answer "what exactly was that?".
 */

export type InsightTxn = {
  id: string;
  monthKey: string;
  posted_at: string;
  description: string;
  merchant: string | null;
  amount: number;
  category_id: string | null;
  scope: "household" | "personal";
  is_transfer: boolean;
  account_id: string | null;
};

type Cat = { id: string; name: string; icon: string | null; kind: string; parent_id: string | null };
type Acc = { id: string; name: string; type: string | null };
type Month = { key: string; label: string };

const INCOME = "#0d9488"; // teal-600
const SPEND = "#d97706"; // amber-600
const INK = "#57534e"; // stone-600
const MUTED = "#a8a29e"; // stone-400
const GRID = "#f5f5f4"; // stone-100
const BASE = "#d6d3d1"; // stone-300

/** Bar with a 4px-rounded data end, anchored to the baseline. */
function bar(x: number, y: number, w: number, h: number, up: boolean): string {
  const r = Math.min(4, h, w / 2);
  if (h <= 0.5) return `M ${x} ${y} h ${w} v 0 h ${-w} Z`;
  if (up)
    return `M ${x} ${y + h} v ${-(h - r)} q 0 ${-r} ${r} ${-r} h ${w - 2 * r} q ${r} 0 ${r} ${r} v ${h - r} Z`;
  return `M ${x} ${y} v ${h - r} q 0 ${r} ${r} ${r} h ${w - 2 * r} q ${r} 0 ${r} ${-r} v ${-(h - r)} Z`;
}

function shortMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return m === 1 ? `${names[m - 1]} ${String(y).slice(2)}` : names[m - 1];
}

function compact(n: number): string {
  const v = Math.abs(n);
  if (v >= 100000) return `${Math.round(v / 1000)}k`;
  if (v >= 10000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v).toLocaleString("en-AU")}`;
}

type Drill =
  | { kind: "cat"; catId: string | "none"; side: "spend" | "income"; monthKey?: string }
  | { kind: "merchant"; key: string; name: string }
  | null;

export function InsightsClient({
  months,
  txns,
  categories,
  accounts,
  currency,
}: {
  months: Month[];
  txns: InsightTxn[];
  categories: Cat[];
  accounts: Acc[];
  currency: string;
}) {
  const [drill, setDrill] = useState<Drill>(null);

  const fmt = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const merchantKey = (t: InsightTxn) => (t.merchant ?? t.description).trim().toLowerCase();

  // household rows only — transfers and personal spending stay out, like budgets
  const household = useMemo(
    () => txns.filter((t) => !t.is_transfer && t.scope === "household"),
    [txns]
  );

  // ── Aggregations ───────────────────────────────────────────────────────────

  const perMonth = useMemo(() => {
    const init = () => ({ income: 0, spend: 0, savings: 0 });
    const map = new Map(months.map((m) => [m.key, init()]));
    for (const t of household) {
      const b = map.get(t.monthKey);
      if (!b) continue;
      if (t.amount >= 0) b.income += t.amount;
      else b.spend += -t.amount;
    }
    // savings flow = the transfer legs that land on / leave savings accounts
    for (const t of txns) {
      if (!t.is_transfer || !t.account_id) continue;
      if (accById.get(t.account_id)?.type !== "savings") continue;
      const b = map.get(t.monthKey);
      if (b) b.savings += t.amount;
    }
    return map;
  }, [household, txns, months, accById]);

  const totals = useMemo(() => {
    let income = 0, spend = 0, savings = 0;
    for (const m of months) {
      const b = perMonth.get(m.key)!;
      income += b.income;
      spend += b.spend;
      savings += b.savings;
    }
    return { income, spend, savings, left: income - spend, avgSpend: spend / months.length };
  }, [perMonth, months]);

  /** category (or "none") → month → net amount, split by spending vs income side */
  const matrix = useMemo(() => {
    const spendM = new Map<string, Map<string, number>>();
    const incomeM = new Map<string, Map<string, number>>();
    const add = (m: Map<string, Map<string, number>>, cat: string, month: string, v: number) => {
      let row = m.get(cat);
      if (!row) { row = new Map(); m.set(cat, row); }
      row.set(month, (row.get(month) ?? 0) + v);
    };
    for (const t of household) {
      const cat = t.category_id ? catById.get(t.category_id) : null;
      if (cat) {
        if (cat.kind === "income") add(incomeM, cat.id, t.monthKey, t.amount);
        else add(spendM, cat.id, t.monthKey, -t.amount);
      } else if (t.amount < 0) add(spendM, "none", t.monthKey, -t.amount);
      else add(incomeM, "none", t.monthKey, t.amount);
    }
    const rows = (m: Map<string, Map<string, number>>) =>
      [...m.entries()]
        .map(([catId, byMonth]) => ({
          catId,
          byMonth,
          total: [...byMonth.values()].reduce((s, v) => s + v, 0),
        }))
        .sort((a, b) => b.total - a.total);
    return { spend: rows(spendM), income: rows(incomeM) };
  }, [household, catById]);

  const spendCellMax = useMemo(
    () => Math.max(1, ...matrix.spend.flatMap((r) => [...r.byMonth.values()])),
    [matrix]
  );

  const topMerchants = useMemo(() => {
    const map = new Map<string, { name: string; total: number; n: number }>();
    for (const t of household) {
      if (t.amount >= 0) continue;
      const key = merchantKey(t);
      if (!key) continue;
      const e = map.get(key) ?? { name: (t.merchant ?? t.description).trim(), total: 0, n: 0 };
      e.total += -t.amount;
      e.n += 1;
      map.set(key, e);
    }
    return [...map.entries()]
      .map(([key, e]) => ({ key, ...e }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [household]);

  // ── Drill-in rows ──────────────────────────────────────────────────────────

  const drillRows = useMemo(() => {
    if (!drill) return [];
    let list: InsightTxn[] = [];
    if (drill.kind === "cat") {
      list = household.filter((t) => {
        if (drill.monthKey && t.monthKey !== drill.monthKey) return false;
        if (drill.catId === "none") {
          if (t.category_id) return false;
          return drill.side === "spend" ? t.amount < 0 : t.amount >= 0;
        }
        return t.category_id === drill.catId;
      });
    } else {
      list = household.filter((t) => t.amount < 0 && merchantKey(t) === drill.key);
    }
    return [...list].sort((a, b) => (a.posted_at < b.posted_at ? 1 : -1));
  }, [drill, household]);

  const drillTitle = !drill
    ? ""
    : drill.kind === "merchant"
      ? drill.name
      : `${
          drill.catId === "none"
            ? drill.side === "spend" ? "◌ Uncategorised spending" : "◌ Uncategorised income"
            : `${catById.get(drill.catId)?.icon ?? "🏷️"} ${catById.get(drill.catId)?.name ?? ""}`
        }${drill.monthKey ? ` · ${months.find((m) => m.key === drill.monthKey)?.label ?? ""}` : " · all six months"}`;

  const drillTotal = drillRows.reduce((s, t) => s + t.amount, 0);

  // ── Charts ─────────────────────────────────────────────────────────────────

  const W = 640, H = 220, padT = 22, padB = 24, padX = 10;
  const plotH = H - padT - padB;
  const slot = (W - padX * 2) / months.length;
  const barW = Math.min(34, (slot - 18) / 2);

  const pairMax = Math.max(1, ...months.map((m) => Math.max(perMonth.get(m.key)!.income, perMonth.get(m.key)!.spend)));
  const savMax = Math.max(1, ...months.map((m) => Math.abs(perMonth.get(m.key)!.savings)));

  const legend = (items: { color: string; label: string }[]) => (
    <div className="flex items-center gap-4 text-xs text-stone-500">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );

  const tile = (label: string, value: string, sub?: string, tone?: "good" | "bad") => (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-teal-700" : "text-stone-800"}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-stone-400">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tile("Money in", fmt(totals.income))}
        {tile("Money out", fmt(-totals.spend), undefined, "bad")}
        {tile("Left over", fmt(totals.left), undefined, totals.left >= 0 ? "good" : "bad")}
        {tile("Put into savings", fmt(totals.savings), "net across the period", totals.savings >= 0 ? "good" : "bad")}
        {tile("Avg monthly spend", fmt(-totals.avgSpend), undefined, "bad")}
      </div>

      {/* Income vs spending */}
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Income vs spending, month by month</h2>
          {legend([{ color: INCOME, label: "Income" }, { color: SPEND, label: "Spending" }])}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Income versus spending per month">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={padX} x2={W - padX} y1={padT + plotH * (1 - f)} y2={padT + plotH * (1 - f)} stroke={GRID} />
          ))}
          <line x1={padX} x2={W - padX} y1={padT + plotH} y2={padT + plotH} stroke={BASE} />
          {months.map((m, i) => {
            const b = perMonth.get(m.key)!;
            const cx = padX + i * slot + slot / 2;
            const hInc = (b.income / pairMax) * plotH;
            const hSp = (b.spend / pairMax) * plotH;
            const last = i === months.length - 1;
            return (
              <g key={m.key}>
                <path d={bar(cx - barW - 1, padT + plotH - hInc, barW, hInc, true)} fill={INCOME}>
                  <title>{`${m.label} — income ${fmt(b.income)}`}</title>
                </path>
                <path d={bar(cx + 1, padT + plotH - hSp, barW, hSp, true)} fill={SPEND}>
                  <title>{`${m.label} — spending ${fmt(-b.spend)}`}</title>
                </path>
                {last && b.income > 0 && (
                  <text x={cx - 1 - barW / 2} y={padT + plotH - hInc - 6} textAnchor="middle" fontSize="11" fill={INK}>
                    {compact(b.income)}
                  </text>
                )}
                {last && b.spend > 0 && (
                  <text x={cx + 1 + barW / 2} y={padT + plotH - hSp - 6} textAnchor="middle" fontSize="11" fill={INK}>
                    {compact(b.spend)}
                  </text>
                )}
                <text x={cx} y={H - 7} textAnchor="middle" fontSize="11" fill={MUTED}>
                  {shortMonth(m.key)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Savings flow */}
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Savings flow</h2>
            <p className="text-xs text-stone-400">Money moved into (▲) and out of (▼) your savings accounts — transfers, so never counted as income or spending.</p>
          </div>
          {legend([{ color: INCOME, label: "Put away" }, { color: SPEND, label: "Drawn down" }])}
        </div>
        <svg viewBox={`0 0 ${W} 190`} className="w-full" role="img" aria-label="Net savings flow per month">
          {(() => {
            const h2 = 190, mid = (h2 - 26) / 2 + 12;
            const scale = (h2 - 26 - 24) / 2 / savMax;
            return (
              <>
                <line x1={padX} x2={W - padX} y1={mid} y2={mid} stroke={BASE} />
                {months.map((m, i) => {
                  const v = perMonth.get(m.key)!.savings;
                  const cx = padX + i * slot + slot / 2;
                  const h = Math.abs(v) * scale;
                  const last = i === months.length - 1;
                  return (
                    <g key={m.key}>
                      {v >= 0 ? (
                        <path d={bar(cx - barW / 2, mid - h, barW, h, true)} fill={INCOME}>
                          <title>{`${m.label} — put away ${fmt(v)}`}</title>
                        </path>
                      ) : (
                        <path d={bar(cx - barW / 2, mid, barW, h, false)} fill={SPEND}>
                          <title>{`${m.label} — drawn down ${fmt(v)}`}</title>
                        </path>
                      )}
                      {last && Math.abs(v) > 0.005 && (
                        <text x={cx} y={v >= 0 ? mid - h - 6 : mid + h + 13} textAnchor="middle" fontSize="11" fill={INK}>
                          {compact(v)}
                        </text>
                      )}
                      <text x={cx} y={h2 - 4} textAnchor="middle" fontSize="11" fill={MUTED}>
                        {shortMonth(m.key)}
                      </text>
                    </g>
                  );
                })}
              </>
            );
          })()}
        </svg>
      </div>

      {/* Category × month matrix */}
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="px-5 pt-4">
          <h2 className="text-sm font-semibold">Spending by category, month by month</h2>
          <p className="mt-0.5 text-xs text-stone-400">Click any amount to see exactly which transactions are behind it; click a category name for its whole six months.</p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 200 }} />
              {months.map((m) => (
                <col key={m.key} />
              ))}
              <col style={{ width: 110 }} />
            </colgroup>
            <thead>
              <tr className="bg-stone-900 text-white">
                <th className="px-4 py-2 text-left font-medium">Category</th>
                {months.map((m) => (
                  <th key={m.key} className="px-2 py-2 text-right font-medium">{shortMonth(m.key)}</th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {matrix.spend.map((row, i) => {
                const cat = row.catId === "none" ? null : catById.get(row.catId);
                return (
                  <tr key={row.catId} className={`border-b border-stone-100 ${i % 2 ? "bg-stone-50" : ""}`}>
                    <td className="truncate px-4 py-1.5">
                      <button
                        type="button"
                        onClick={() => setDrill({ kind: "cat", catId: row.catId as string | "none", side: "spend" })}
                        className="max-w-full truncate text-left hover:underline"
                        title="All six months for this category"
                      >
                        {cat ? `${cat.icon ?? "🏷️"} ${cat.name}` : "◌ Uncategorised"}
                      </button>
                    </td>
                    {months.map((m) => {
                      const v = row.byMonth.get(m.key) ?? 0;
                      const alpha = v > 0 ? 0.05 + 0.2 * (v / spendCellMax) : 0;
                      return (
                        <td key={m.key} className="px-1 py-1 text-right">
                          {v !== 0 ? (
                            <button
                              type="button"
                              onClick={() => setDrill({ kind: "cat", catId: row.catId as string | "none", side: "spend", monthKey: m.key })}
                              className={`w-full rounded px-1.5 py-0.5 text-right tabular-nums hover:ring-1 hover:ring-teal-400 ${v < 0 ? "text-emerald-600" : "text-stone-700"}`}
                              style={{ background: v > 0 ? `rgba(13,148,136,${alpha.toFixed(3)})` : undefined }}
                              title={`${cat ? cat.name : "Uncategorised"} · ${m.label}: ${fmt(-v)}`}
                            >
                              {compact(v)}
                              {v < 0 ? " cr" : ""}
                            </button>
                          ) : (
                            <span className="px-1.5 text-stone-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums">{compact(row.total)}</td>
                  </tr>
                );
              })}
              {matrix.spend.length === 0 && (
                <tr>
                  <td colSpan={months.length + 2} className="px-4 py-8 text-center text-sm text-stone-400">
                    No household spending in this period.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-200 bg-stone-50 text-xs font-semibold">
                <td className="px-4 py-2">Total spending</td>
                {months.map((m) => (
                  <td key={m.key} className="px-2 py-2 text-right tabular-nums">
                    {compact(perMonth.get(m.key)!.spend)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums">{compact(totals.spend)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {matrix.income.length > 0 && (
          <>
            <div className="border-t border-stone-100 px-5 pt-4">
              <h3 className="text-sm font-semibold">Income, month by month</h3>
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: 200 }} />
                  {months.map((m) => (
                    <col key={m.key} />
                  ))}
                  <col style={{ width: 110 }} />
                </colgroup>
                <tbody>
                  {matrix.income.map((row, i) => {
                    const cat = row.catId === "none" ? null : catById.get(row.catId);
                    return (
                      <tr key={row.catId} className={`border-b border-stone-100 ${i % 2 ? "bg-stone-50" : ""}`}>
                        <td className="truncate px-4 py-1.5">
                          <button
                            type="button"
                            onClick={() => setDrill({ kind: "cat", catId: row.catId as string | "none", side: "income" })}
                            className="max-w-full truncate text-left hover:underline"
                          >
                            {cat ? `${cat.icon ?? "🏷️"} ${cat.name}` : "◌ Uncategorised income"}
                          </button>
                        </td>
                        {months.map((m) => {
                          const v = row.byMonth.get(m.key) ?? 0;
                          return (
                            <td key={m.key} className="px-1 py-1 text-right">
                              {v !== 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setDrill({ kind: "cat", catId: row.catId as string | "none", side: "income", monthKey: m.key })}
                                  className="w-full rounded px-1.5 py-0.5 text-right tabular-nums text-emerald-700 hover:ring-1 hover:ring-teal-400"
                                  title={`${cat ? cat.name : "Uncategorised income"} · ${m.label}: ${fmt(v)}`}
                                >
                                  {compact(v)}
                                </button>
                              ) : (
                                <span className="px-1.5 text-stone-300">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-1.5 text-right font-medium tabular-nums text-emerald-700">{compact(row.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Top merchants */}
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold">Where the money goes — top merchants</h2>
        <div className="mt-3 space-y-1">
          {topMerchants.map((mo) => {
            const w = (mo.total / (topMerchants[0]?.total || 1)) * 100;
            return (
              <button
                key={mo.key}
                type="button"
                onClick={() => setDrill({ kind: "merchant", key: mo.key, name: mo.name })}
                className="group flex w-full items-center gap-3 rounded-lg px-2 py-1 text-left hover:bg-stone-50"
                title="See the transactions"
              >
                <span className="w-44 truncate text-sm group-hover:underline">{mo.name}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <span className="block h-full rounded-full" style={{ width: `${w}%`, background: SPEND }} />
                </span>
                <span className="w-20 text-right text-sm font-medium tabular-nums">{fmt(-mo.total)}</span>
                <span className="w-10 text-right text-[11px] text-stone-400">×{mo.n}</span>
              </button>
            );
          })}
          {topMerchants.length === 0 && <p className="py-4 text-sm text-stone-400">No spending in this period.</p>}
        </div>
      </div>

      {/* Drill-in modal */}
      {drill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDrill(null)}>
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-stone-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3.5">
              <h2 className="min-w-0 truncate text-base font-semibold">{drillTitle}</h2>
              <button
                type="button"
                onClick={() => setDrill(null)}
                className="rounded-lg px-2 py-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
              {drillRows.map((t) => (
                <div key={t.id} className="flex items-baseline gap-3 border-b border-stone-50 py-1.5 text-sm">
                  <span className="w-20 shrink-0 text-xs tabular-nums text-stone-400">
                    {new Date(t.posted_at).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={t.description}>
                    {t.merchant ?? t.description}
                  </span>
                  <span className="hidden w-28 shrink-0 truncate text-right text-xs text-stone-400 sm:block">
                    {t.account_id ? accById.get(t.account_id)?.name : ""}
                  </span>
                  <span className={`w-24 shrink-0 text-right font-medium tabular-nums ${t.amount < 0 ? "text-stone-800" : "text-emerald-600"}`}>
                    {fmt(t.amount)}
                  </span>
                </div>
              ))}
              {drillRows.length === 0 && <p className="py-6 text-center text-sm text-stone-400">Nothing here.</p>}
            </div>
            <div className="flex items-center justify-between border-t border-stone-100 bg-stone-50 px-5 py-2.5 text-sm">
              <span className="text-stone-500">
                {drillRows.length} transaction{drillRows.length === 1 ? "" : "s"}
              </span>
              <span className={`font-semibold tabular-nums ${drillTotal < 0 ? "text-stone-800" : "text-emerald-600"}`}>
                {fmt(drillTotal)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
