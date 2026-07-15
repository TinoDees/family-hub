"use client";

import { useMemo, useRef, useState } from "react";

type Row = {
  id: string;
  posted_at: string;
  description: string;
  merchant: string | null;
  amount: number;
  category_id: string | null;
  source: string;
  account_id: string | null;
};
type Cat = { id: string; name: string; icon: string | null };
type Acc = { id: string; name: string };
type SortKey = "date" | "desc" | "account" | "category" | "amount";

export function TransactionsGrid({
  rows,
  categories,
  accounts,
  canEdit,
  currency,
  monthKey,
  setCategoryAction,
  deleteAction,
}: {
  rows: Row[];
  categories: Cat[];
  accounts: Acc[];
  canEdit: boolean;
  currency: string;
  monthKey: string;
  setCategoryAction: (formData: FormData) => void;
  deleteAction: (formData: FormData) => void;
}) {
  const [q, setQ] = useState("");
  const [acc, setAcc] = useState("");
  const [cat, setCat] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<SortKey>("date");
  const [dir, setDir] = useState<1 | -1>(-1);

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, `${c.icon ?? ""} ${c.name}`.trim()])), [categories]);
  const accName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (needle && !`${r.description} ${r.merchant ?? ""}`.toLowerCase().includes(needle)) return false;
      if (acc && r.account_id !== acc) return false;
      if (cat === "none" && r.category_id) return false;
      if (cat && cat !== "none" && r.category_id !== cat) return false;
      if (from && r.posted_at < from) return false;
      if (to && r.posted_at > to) return false;
      return true;
    });
    const key = (r: Row): string | number => {
      switch (sort) {
        case "date": return r.posted_at;
        case "desc": return (r.merchant ?? r.description).toLowerCase();
        case "account": return r.account_id ? (accName.get(r.account_id) ?? "") : "";
        case "category": return r.category_id ? (catName.get(r.category_id) ?? "") : "";
        case "amount": return r.amount;
      }
    };
    return [...list].sort((a, b) => {
      const ka = key(a), kb = key(b);
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir;
    });
  }, [rows, q, acc, cat, from, to, sort, dir, accName, catName]);

  const totals = useMemo(() => {
    let inn = 0, out = 0;
    for (const r of filtered) r.amount >= 0 ? (inn += r.amount) : (out += r.amount);
    return { inn, out, net: inn + out, n: filtered.length };
  }, [filtered]);

  const clickSort = (k: SortKey) => {
    if (sort === k) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSort(k);
      setDir(k === "date" || k === "amount" ? -1 : 1);
    }
  };
  const arrow = (k: SortKey) => (sort === k ? (dir === 1 ? " ↑" : " ↓") : "");

  const exportCsv = () => {
    const head = "Date,Description,Merchant,Account,Category,Amount";
    const lines = filtered.map((r) =>
      [
        r.posted_at,
        `"${r.description.replaceAll('"', '""')}"`,
        `"${(r.merchant ?? "").replaceAll('"', '""')}"`,
        `"${r.account_id ? (accName.get(r.account_id) ?? "") : ""}"`,
        `"${r.category_id ? (catName.get(r.category_id) ?? "") : ""}"`,
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

  const TH = ({ k, children, right = false }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th
      onClick={() => clickSort(k)}
      className={`cursor-pointer select-none px-3 py-2.5 font-medium hover:bg-stone-800 ${right ? "text-right" : "text-left"}`}
    >
      {children}
      {arrow(k)}
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Search description or merchant…"
          className="min-w-52 flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
        />
        <select value={acc} onChange={(e) => setAcc(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm">
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm">
          <option value="">All categories</option>
          <option value="none">Uncategorised</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
        <label className="text-xs text-stone-400">
          from
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-1 rounded-lg border border-stone-300 px-2 py-1.5 text-sm text-stone-700" />
        </label>
        <label className="text-xs text-stone-400">
          to
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-1 rounded-lg border border-stone-300 px-2 py-1.5 text-sm text-stone-700" />
        </label>
        <button type="button" onClick={exportCsv} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-100">
          ⬇ CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-stone-400">Nothing matches these filters.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-900 text-white">
                <TH k="date">Date</TH>
                <TH k="desc">Description</TH>
                <TH k="account">Account</TH>
                <TH k="category">Category</TH>
                <TH k="amount" right>Amount</TH>
                {canEdit && <th className="px-3 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => (
                <tr key={t.id} className={`border-b border-stone-100 ${i % 2 ? "bg-stone-50" : ""}`}>
                  <td className="whitespace-nowrap px-3 py-2 text-stone-500">
                    {new Date(t.posted_at).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}
                  </td>
                  <td className="max-w-72 truncate px-3 py-2" title={t.description}>
                    {t.merchant ?? t.description}
                    {t.source !== "manual" && (
                      <span className="ml-2 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] uppercase text-stone-400">{t.source}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-stone-500">{t.account_id ? accName.get(t.account_id) : "—"}</td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <CategoryPicker
                        txnId={t.id}
                        monthKey={monthKey}
                        current={t.category_id ? (categories.find((c) => c.id === t.category_id)?.name ?? "") : ""}
                        categorised={Boolean(t.category_id)}
                        categories={categories}
                        action={setCategoryAction}
                      />
                    ) : (
                      <span className="text-stone-500">{t.category_id ? catName.get(t.category_id) : "—"}</span>
                    )}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums ${t.amount < 0 ? "text-stone-800" : "text-emerald-600"}`}>
                    {fmt(t.amount)}
                  </td>
                  {canEdit && (
                    <td className="px-2 py-2 text-right">
                      <form action={deleteAction}>
                        <input type="hidden" name="txn_id" value={t.id} />
                        <input type="hidden" name="m" value={monthKey} />
                        <button className="rounded px-1.5 py-1 text-xs text-stone-300 hover:bg-red-50 hover:text-red-600" title="Delete">✕</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-200 bg-stone-50 text-xs font-medium">
                <td className="px-3 py-2 text-stone-500" colSpan={2}>
                  {totals.n} transaction{totals.n === 1 ? "" : "s"}
                </td>
                <td className="px-3 py-2 text-emerald-600">in {fmt(totals.inn)}</td>
                <td className="px-3 py-2 text-red-600">out {fmt(totals.out)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${totals.net < 0 ? "text-red-600" : "text-emerald-600"}`}>
                  net {fmt(totals.net)}
                </td>
                {canEdit && <td />}
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

function CategoryPicker({
  txnId,
  monthKey,
  current,
  categorised,
  categories,
  action,
}: {
  txnId: string;
  monthKey: string;
  current: string;
  categorised: boolean;
  categories: Cat[];
  action: (formData: FormData) => void;
}) {
  const [q, setQ] = useState(current);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? categories.filter((c) => c.name.toLowerCase().includes(needle))
    : categories;
  const exact = categories.some((c) => c.name.trim().toLowerCase() === needle);

  const choose = (value: string) => {
    setQ(value);
    setOpen(false);
    requestAnimationFrame(() => formRef.current?.requestSubmit());
  };

  return (
    <form action={action} ref={formRef} className="relative">
      <input type="hidden" name="txn_id" value={txnId} />
      <input type="hidden" name="m" value={monthKey} />
      <input type="hidden" name="category_name" value={q} />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="category…"
        autoComplete="off"
        className={`w-40 rounded-lg border px-2 py-1 text-xs outline-none focus:border-stone-500 ${
          categorised ? "border-stone-200 bg-white" : "border-amber-300 bg-amber-50"
        }`}
      />
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
          <div className="max-h-52 overflow-y-auto py-1">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                choose("");
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
                  choose(c.name);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-stone-50"
              >
                <span>{c.icon ?? "🏷️"}</span>
                <span className="truncate">{c.name}</span>
              </button>
            ))}
            {filtered.length === 0 && !needle && (
              <p className="px-3 py-2 text-xs text-stone-400">No categories yet.</p>
            )}
          </div>
          {needle && !exact && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                choose(q.trim());
              }}
              className="flex w-full items-center gap-2 border-t border-stone-100 bg-teal-50 px-3 py-2 text-left text-xs font-medium text-teal-700 hover:bg-teal-100"
            >
              ＋ Create &ldquo;{q.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </form>
  );
}
