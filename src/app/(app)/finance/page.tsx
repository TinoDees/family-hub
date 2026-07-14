import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFinance, formatMoney, monthBounds, shiftMonth } from "@/lib/finance";

export default async function FinanceOverview({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { membership, access } = await requireFinance("view");
  const { m } = await searchParams;
  const month = monthBounds(m);
  const currency = membership.household.base_currency;

  const supabase = await createClient();
  const [{ data: txns }, { data: categories }, { data: budgets }, { count: accountCount }] =
    await Promise.all([
      supabase
        .from("finance_transactions")
        .select("amount, category_id, posted_at, description")
        .eq("household_id", membership.household_id)
        .gte("posted_at", month.start)
        .lte("posted_at", month.end),
      supabase
        .from("finance_categories")
        .select("id, name, icon, kind")
        .eq("household_id", membership.household_id)
        .order("name"),
      supabase
        .from("finance_budgets")
        .select("category_id, amount")
        .eq("household_id", membership.household_id),
      supabase
        .from("finance_accounts")
        .select("id", { count: "exact", head: true })
        .eq("household_id", membership.household_id),
    ]);

  const all = txns ?? [];
  const income = all.filter((t) => t.amount > 0).reduce((s, t) => s + Number(t.amount), 0);
  const spend = all.filter((t) => t.amount < 0).reduce((s, t) => s + Number(t.amount), 0);
  const uncategorised = all.filter((t) => !t.category_id).length;

  const budgetMap = new Map((budgets ?? []).map((b) => [b.category_id, Number(b.amount)]));
  const spendByCat = new Map<string, number>();
  for (const t of all) {
    if (t.amount < 0 && t.category_id) {
      spendByCat.set(t.category_id, (spendByCat.get(t.category_id) ?? 0) - Number(t.amount));
    }
  }
  const catRows = (categories ?? [])
    .filter((c) => c.kind === "expense")
    .map((c) => ({
      ...c,
      spent: spendByCat.get(c.id) ?? 0,
      budget: budgetMap.get(c.id),
    }))
    .filter((c) => c.spent > 0 || c.budget)
    .sort((a, b) => b.spent - a.spent);

  const setupNeeded = (accountCount ?? 0) === 0 || (categories ?? []).length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">💰 Finance</h1>
          <p className="text-sm text-stone-500">{membership.household.name} — base {currency}</p>
        </div>
        <div className="flex items-center gap-2">
          {access === "edit" && (
            <>
              <Link href="/finance/import" className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700">
                Import bank CSV
              </Link>
              <Link href="/finance/accounts" className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100">
                Accounts
              </Link>
              <Link href="/finance/setup" className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100">
                Setup
              </Link>
            </>
          )}
        </div>
      </div>

      {setupNeeded && access === "edit" && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
          First time here? Go to{" "}
          <Link href="/finance/setup" className="font-medium underline">Setup</Link>{" "}
          — add your bank account and load the starter categories, then{" "}
          <Link href="/finance/import" className="font-medium underline">import</Link>{" "}
          a CSV from NAB internet banking.
        </div>
      )}

      <div className="flex items-center gap-3">
        <Link href={`/finance?m=${shiftMonth(month.key, -1)}`} className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100">←</Link>
        <span className="min-w-40 text-center text-sm font-medium">{month.label}</span>
        <Link href={`/finance?m=${shiftMonth(month.key, 1)}`} className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100">→</Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Income</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-600">{formatMoney(income, currency)}</div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Spending</div>
          <div className="mt-1 text-2xl font-semibold text-red-600">{formatMoney(spend, currency)}</div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Net</div>
          <div className={`mt-1 text-2xl font-semibold ${income + spend >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {formatMoney(income + spend, currency)}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Spending by category</h2>
          <Link href={`/finance/transactions?m=${month.key}`} className="text-sm text-stone-500 underline">
            All transactions ({all.length})
          </Link>
        </div>
        {catRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-400">
            No categorised spending this month yet.
          </p>
        ) : (
          <div className="space-y-3">
            {catRows.map((c) => {
              const pct = c.budget ? Math.min(100, (c.spent / c.budget) * 100) : null;
              const over = c.budget !== undefined && c.spent > c.budget;
              return (
                <div key={c.id}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>{c.icon} {c.name}</span>
                    <span className={over ? "font-medium text-red-600" : "text-stone-600"}>
                      {formatMoney(c.spent, currency)}
                      {c.budget !== undefined && (
                        <span className="text-stone-400"> / {formatMoney(c.budget, currency)}</span>
                      )}
                    </span>
                  </div>
                  {pct !== null && (
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className={`h-full rounded-full ${over ? "bg-red-500" : "bg-emerald-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {uncategorised > 0 && (
          <p className="mt-4 text-sm text-amber-700">
            {uncategorised} transaction{uncategorised === 1 ? "" : "s"} without a category —{" "}
            <Link href={`/finance/transactions?m=${month.key}&filter=uncategorised`} className="underline">
              categorise them
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
