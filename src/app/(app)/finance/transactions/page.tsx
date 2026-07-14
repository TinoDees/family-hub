import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFinance, formatMoney, monthBounds, shiftMonth } from "@/lib/finance";
import {
  addTransaction,
  setTransactionCategory,
  deleteTransaction,
} from "@/lib/actions/finance";
import { inputCls } from "@/components/auth-card";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; error?: string; saved?: string; filter?: string; account?: string }>;
}) {
  const { membership, access } = await requireFinance("view");
  const { m, error, saved, filter, account } = await searchParams;
  const month = monthBounds(m);
  const currency = membership.household.base_currency;
  const canEdit = access === "edit";

  const supabase = await createClient();
  const [{ data: txns }, { data: categories }, { data: accounts }] = await Promise.all([
    supabase
      .from("finance_transactions")
      .select("id, posted_at, description, merchant, amount, category_id, source, account_id")
      .eq("household_id", membership.household_id)
      .gte("posted_at", month.start)
      .lte("posted_at", month.end)
      .order("posted_at", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("finance_categories")
      .select("id, name, icon, kind")
      .eq("household_id", membership.household_id)
      .order("name"),
    supabase
      .from("finance_accounts")
      .select("id, name")
      .eq("household_id", membership.household_id)
      .order("name"),
  ]);

  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]));
  const rows = (txns ?? [])
    .filter((t) => (filter === "uncategorised" ? !t.category_id : true))
    .filter((t) => (account ? t.account_id === account : true));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/finance" className="text-xs text-stone-400 hover:underline">← Finance</Link>
          <h1 className="text-2xl font-semibold">Transactions</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/finance/transactions?m=${shiftMonth(month.key, -1)}${filter ? `&filter=${filter}` : ""}`} className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100">←</Link>
          <span className="min-w-36 text-center text-sm font-medium">{month.label}</span>
          <Link href={`/finance/transactions?m=${shiftMonth(month.key, 1)}${filter ? `&filter=${filter}` : ""}`} className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100">→</Link>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Saved.</p>}
      {account && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-700">
          Showing {accountName.get(account) ?? "one account"} only.{" "}
          <Link href={`/finance/transactions?m=${month.key}`} className="underline">Show all</Link>
        </p>
      )}
      {filter === "uncategorised" && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-700">
          Showing uncategorised only.{" "}
          <Link href={`/finance/transactions?m=${month.key}`} className="underline">Show all</Link>
        </p>
      )}

      {canEdit && (
        <details className="rounded-xl border border-stone-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-stone-600">
            + Add manual transaction
          </summary>
          <form action={addTransaction} className="flex flex-wrap items-end gap-3 border-t border-stone-100 p-4">
            <div>
              <label className="mb-1 block text-xs font-medium">Date</label>
              <input name="posted_at" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputCls} />
            </div>
            <div className="min-w-48 flex-1">
              <label className="mb-1 block text-xs font-medium">Description</label>
              <input name="description" required placeholder="e.g. School excursion" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Amount</label>
              <input name="amount" type="number" step="0.01" min="0" required placeholder="0.00" className={`${inputCls} w-28`} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Type</label>
              <select name="kind" className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Account</label>
              <select name="account_id" className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
                <option value="">—</option>
                {(accounts ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Category</label>
              <select name="category_id" className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
                <option value="">—</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
            <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">Add</button>
          </form>
        </details>
      )}

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-stone-400">
            No transactions for {month.label}.{" "}
            {canEdit && (
              <Link href="/finance/import" className="underline">Import a bank CSV</Link>
            )}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-900 text-left text-white">
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Description</th>
                <th className="px-3 py-2.5 font-medium">Account</th>
                <th className="px-3 py-2.5 font-medium">Category</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                {canEdit && <th className="px-3 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
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
                  <td className="px-3 py-2 text-stone-500">{t.account_id ? accountName.get(t.account_id) : "—"}</td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <form action={setTransactionCategory} className="flex items-center gap-1">
                        <input type="hidden" name="txn_id" value={t.id} />
                        <input type="hidden" name="m" value={month.key} />
                        <select
                          name="category_id"
                          defaultValue={t.category_id ?? ""}
                          className={`rounded-lg border px-2 py-1 text-xs ${t.category_id ? "border-stone-200 bg-white" : "border-amber-300 bg-amber-50"}`}
                        >
                          <option value="">— none —</option>
                          {(categories ?? []).map((c) => (
                            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                          ))}
                        </select>
                        <button className="rounded border border-stone-200 px-1.5 py-1 text-[10px] text-stone-500 hover:bg-stone-100">✓</button>
                      </form>
                    ) : (
                      <span className="text-stone-500">
                        {(categories ?? []).find((c) => c.id === t.category_id)?.name ?? "—"}
                      </span>
                    )}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-medium ${Number(t.amount) < 0 ? "text-stone-800" : "text-emerald-600"}`}>
                    {formatMoney(Number(t.amount), currency)}
                  </td>
                  {canEdit && (
                    <td className="px-2 py-2 text-right">
                      <form action={deleteTransaction}>
                        <input type="hidden" name="txn_id" value={t.id} />
                        <input type="hidden" name="m" value={month.key} />
                        <button className="rounded px-1.5 py-1 text-xs text-stone-300 hover:bg-red-50 hover:text-red-600" title="Delete">✕</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
