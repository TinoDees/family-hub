"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createCategoryInline,
  assignCategoryInline,
  deleteTransactionInline,
} from "@/lib/actions/finance";
import {
  suggestCategories,
  acceptSuggestion,
  dismissSuggestion,
  acceptAllSuggestions,
} from "@/lib/actions/classify";
import { findTransfersInline, setTransferInline } from "@/lib/actions/transfers";

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
  account_id: string | null;
};
type Cat = { id: string; name: string; icon: string | null; kind: string };
type Acc = { id: string; name: string };
type SortKey = "date" | "desc" | "account" | "category" | "amount";

const EMOJIS = ["🐾","🔌","🛠️","🚗","🏠","🛒","🍽️","🎬","👕","💊","✈️","🎁","📱","🎓","⚡","💧","🏋️","🎮","🧸","☕","🎰","🏦","💳","🧾"];

export function TransactionsGrid({
  rows,
  categories,
  accounts,
  canEdit,
  currency,
  monthKey,
  statusPill = false,
  hideAccountColumn = false,
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
}) {
  const [data, setData] = useState(rows);
  const [cats, setCats] = useState(categories);
  useEffect(() => setData(rows), [rows]);
  useEffect(() => setCats(categories), [categories]);

  const [q, setQ] = useState("");
  const [acc, setAcc] = useState("");
  const [cat, setCat] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<SortKey>("date");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [msg, setMsg] = useState<string | null>(null);
  const [modal, setModal] = useState<{ txnId: string; name: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [, startTransition] = useTransition();

  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const accName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const fmt = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);

  const applyCategory = (txnId: string, category: Cat | null) => {
    const prev = data;
    setData((d) =>
      d.map((r) =>
        r.id === txnId ? { ...r, category_id: category?.id ?? null, suggested_category_id: null } : r
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
      d.map((r) =>
        r.id === txnId
          ? { ...r, category_id: r.suggested_category_id, suggested_category_id: null }
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = data.filter((r) => {
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
        case "category": return r.category_id ? (catById.get(r.category_id)?.name ?? "") : "";
        case "amount": return r.amount;
      }
    };
    return [...list].sort((a, b) => {
      const ka = key(a), kb = key(b);
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir;
    });
  }, [data, q, acc, cat, from, to, sort, dir, accName, catById]);

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
        `"${r.category_id ? (catById.get(r.category_id)?.name ?? "") : ""}"`,
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
      {msg && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {msg}{" "}
          <button className="underline" onClick={() => setMsg(null)}>dismiss</button>
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Search description or merchant…"
          className="min-w-52 flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
        />
        {!hideAccountColumn && (
          <select value={acc} onChange={(e) => setAcc(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm">
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm">
          <option value="">All categories</option>
          <option value="none">Uncategorised</option>
          {cats.map((c) => (
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

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-stone-400">Nothing matches these filters.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-900 text-white">
                <TH k="date">Date</TH>
                <TH k="desc">Description</TH>
                {!hideAccountColumn && <TH k="account">Account</TH>}
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
                    {statusPill &&
                      (!t.category_id && !t.is_transfer ? (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">To sort</span>
                      ) : (
                        <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-700">✓ Sorted</span>
                      ))}
                  </td>
                  {!hideAccountColumn && (
                    <td className="px-3 py-2 text-stone-500">{t.account_id ? accName.get(t.account_id) : "—"}</td>
                  )}
                  <td className="px-3 py-2">
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
                      </div>
                    ) : (
                      <span className="text-stone-500">
                        {t.category_id ? `${catById.get(t.category_id)?.icon ?? ""} ${catById.get(t.category_id)?.name ?? "—"}` : "—"}
                      </span>
                    )}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums ${t.amount < 0 ? "text-stone-800" : "text-emerald-600"}`}>
                    {fmt(t.amount)}
                  </td>
                  {canEdit && (
                    <td className="px-2 py-2 text-right">
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
                      <button
                        type="button"
                        onClick={() => removeRow(t.id)}
                        className="rounded px-1.5 py-1 text-xs text-stone-300 hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-200 bg-stone-50 text-xs font-medium">
                <td className="px-3 py-2 text-stone-500" colSpan={hideAccountColumn ? 1 : 2}>
                  {totals.n} transaction{totals.n === 1 ? "" : "s"}
                  {totals.transfers > 0 && (
                    <span className="text-stone-400"> · {totals.transfers} transfer{totals.transfers === 1 ? "" : "s"} not counted</span>
                  )}
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

function NewCategoryModal({
  initialName,
  onClose,
  onCreated,
}: {
  initialName: string;
  onClose: () => void;
  onCreated: (c: Cat) => void;
}) {
  const [name, setName] = useState(initialName);
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
              placeholder="e.g. Lotto"
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
            {busy ? "Creating…" : "Create & apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
