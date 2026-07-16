import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFinance, formatMoney, monthBounds, shiftMonth } from "@/lib/finance";
import { refreshBankBalances } from "@/lib/redbark";

const TYPE_ICON: Record<string, string> = {
  bank: "🏦",
  savings: "🌱",
  cash: "💵",
  credit: "💳",
  other: "📁",
};

/** Finance home — a dashboard: your money first, then the month at a glance. */
export default async function FinanceDashboard({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { membership, access } = await requireFinance("view");
  const { m } = await searchParams;
  const month = monthBounds(m);
  const currency = membership.household.base_currency;
  const canEdit = access === "edit";

  const supabase = await createClient();

  // refresh live bank balances when older than 10 minutes (best-effort)
  const { data: staleCheck } = await supabase
    .from("finance_accounts")
    .select("balance_synced_at")
    .eq("household_id", membership.household_id)
    .not("external_id", "is", null)
    .order("balance_synced_at", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();
  if (
    staleCheck &&
    (!staleCheck.balance_synced_at ||
      Date.now() - new Date(staleCheck.balance_synced_at).getTime() > 10 * 60 * 1000)
  ) {
    try {
      await refreshBankBalances(membership.household_id);
    } catch {
      /* keep old values */
    }
  }

  const [
    { data: accounts },
    { data: sums },
    { data: txns },
    { data: categories },
    { data: budgets },
    { data: goals },
    { data: review },
    { data: recent },
  ] = await Promise.all([
    supabase
      .from("finance_accounts")
      .select("id, name, type, institution, opening_balance, external_id, bank_balance, bank_available, balance_synced_at")
      .eq("household_id", membership.household_id)
      .order("type")
      .order("name"),
    supabase
      .from("finance_transactions")
      .select("account_id, amount")
      .eq("household_id", membership.household_id)
      .not("account_id", "is", null),
    supabase
      .from("finance_transactions")
      .select("amount, category_id")
      .eq("household_id", membership.household_id)
      .eq("is_transfer", false) // internal transfers are neither income nor spending
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
      .from("finance_goals")
      .select("id, name, icon, target_amount, saved_amount, achieved_at")
      .eq("household_id", membership.household_id)
      .is("achieved_at", null)
      .order("created_at")
      .limit(3),
    supabase
      .from("finance_reviews")
      .select("month_key, potential_savings")
      .eq("household_id", membership.household_id)
      .eq("month_key", month.key)
      .maybeSingle(),
    supabase
      .from("finance_transactions")
      .select("id, posted_at, description, merchant, amount, category_id, is_transfer")
      .eq("household_id", membership.household_id)
      .order("posted_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  // account balances: live bank balance if we have one, else opening + transactions
  const txnSum = new Map<string, number>();
  for (const t of sums ?? [])
    txnSum.set(t.account_id!, (txnSum.get(t.account_id!) ?? 0) + Number(t.amount));
  const accountCards = (accounts ?? []).map((a) => ({
    ...a,
    balance:
      a.bank_balance !== null && a.bank_balance !== undefined
        ? Number(a.bank_balance)
        : Number(a.opening_balance) + (txnSum.get(a.id) ?? 0),
    live: a.bank_balance !== null && a.bank_balance !== undefined,
    available:
      a.bank_available !== null && a.bank_available !== undefined ? Number(a.bank_available) : null,
  }));
  const totalBalance = accountCards.reduce((s, a) => s + a.balance, 0);

  const all = txns ?? [];
  const income = all.filter((t) => t.amount > 0).reduce((s, t) => s + Number(t.amount), 0);
  const spend = all.filter((t) => t.amount < 0).reduce((s, t) => s + Number(t.amount), 0);
  const uncategorised = all.filter((t) => !t.category_id).length;

  const budgetMap = new Map((budgets ?? []).map((b) => [b.category_id, Number(b.amount)]));
  const spendByCat = new Map<string, number>();
  for (const t of all)
    if (t.amount < 0 && t.category_id)
      spendByCat.set(t.category_id, (spendByCat.get(t.category_id) ?? 0) - Number(t.amount));
  const catById = new Map((categories ?? []).map((c) => [c.id, c]));
  const catRows = (categories ?? [])
    .filter((c) => c.kind === "expense")
    .map((c) => ({ ...c, spent: spendByCat.get(c.id) ?? 0, budget: budgetMap.get(c.id) }))
    .filter((c) => c.spent > 0 || c.budget)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 6);

  const setupNeeded = (accounts ?? []).length === 0 || (categories ?? []).length === 0;
  const fmtDay = (d: string) =>
    new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "short" });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">💰 Finance</h1>
          <p className="text-sm text-stone-500">{membership.household.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <>
              <Link href="/finance/setup?sec=categories#categories" className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100">
                🏷️ Categories & budgets
              </Link>
              <Link href="/finance/import" className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100">
                Import CSV
              </Link>
            </>
          )}
          <Link href={`/finance?m=${shiftMonth(month.key, -1)}`} className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100">←</Link>
          <span className="min-w-32 text-center text-sm font-medium">{month.label}</span>
          <Link href={`/finance?m=${shiftMonth(month.key, 1)}`} className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100">→</Link>
        </div>
      </div>

      {setupNeeded && canEdit && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
          First time here? Go to{" "}
          <Link href="/finance/setup" className="font-medium underline">Setup</Link>{" "}
          — add your bank account and load the starter categories, then{" "}
          <Link href="/finance/import" className="font-medium underline">import</Link>{" "}
          a CSV from internet banking.
        </div>
      )}

      {/* Your money — accounts first */}
      {accountCards.length > 0 && (
        <div className="rounded-2xl bg-stone-900 p-5 text-white">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-stone-400">
                All accounts together
              </div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">
                {formatMoney(totalBalance, currency)}
              </div>
            </div>
            <Link href="/finance/accounts" className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-stone-200 hover:bg-white/10">
              Manage accounts
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accountCards.map((a) => (
              <Link key={a.id} href={`/finance/accounts/${a.id}`} className="block rounded-xl bg-white/10 p-4 transition-colors hover:bg-white/15">
                <div className="flex items-center gap-2 text-sm text-stone-300">
                  <span>{TYPE_ICON[a.type] ?? "📁"}</span>
                  <span className="truncate">{a.name}</span>
                  {a.live && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> live
                    </span>
                  )}
                </div>
                <div className={`mt-1 text-xl font-semibold tabular-nums ${a.balance < 0 ? "text-red-300" : ""}`}>
                  {formatMoney(a.balance, currency)}
                </div>
                {a.available !== null && (
                  <div className="text-xs text-stone-400">
                    {formatMoney(a.available, currency)} available
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* This month at a glance */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Money in</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-600">{formatMoney(income, currency)}</div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Money out</div>
          <div className="mt-1 text-2xl font-semibold text-red-600">{formatMoney(spend, currency)}</div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Left over</div>
          <div className={`mt-1 text-2xl font-semibold ${income + spend >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {formatMoney(income + spend, currency)}
          </div>
        </div>
      </div>

      {uncategorised > 0 && canEdit && (
        <Link
          href={`/finance/transactions?m=${month.key}&filter=uncategorised`}
          className="flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800 hover:bg-violet-100"
        >
          <span>
            ✨ {uncategorised} transaction{uncategorised === 1 ? "" : "s"} still need a category — let
            the assistant sort them for you.
          </span>
          <span className="font-medium">Sort them →</span>
        </Link>
      )}

      {/* Goals + monthly review */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">🎯 Savings goals</h2>
            <Link href="/finance/goals" className="text-sm text-stone-500 underline">All goals</Link>
          </div>
          {(goals ?? []).length === 0 ? (
            <p className="py-4 text-sm text-stone-400">
              Saving for something? <Link href="/finance/goals" className="underline">Set your first goal</Link> — a
              holiday, a car, a rainy-day fund.
            </p>
          ) : (
            <div className="space-y-3">
              {(goals ?? []).map((g) => {
                const pct = Math.min(100, (Number(g.saved_amount) / Number(g.target_amount)) * 100);
                return (
                  <div key={g.id}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span>{g.icon ?? "🎯"} {g.name}</span>
                      <span className="text-stone-500">
                        {formatMoney(Number(g.saved_amount), currency)}{" "}
                        <span className="text-stone-400">of {formatMoney(Number(g.target_amount), currency)}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-teal-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">📋 Monthly review</h2>
            <Link href={`/finance/review?m=${month.key}`} className="text-sm text-stone-500 underline">Open</Link>
          </div>
          {review ? (
            <p className="text-sm text-stone-600">
              {Number(review.potential_savings) > 0 ? (
                <>
                  We found{" "}
                  <span className="font-semibold text-teal-700">
                    {formatMoney(Number(review.potential_savings), currency)}/month
                  </span>{" "}
                  you could put back in your pocket.{" "}
                </>
              ) : (
                <>A tidy month — nothing jumped out. </>
              )}
              <Link href={`/finance/review?m=${month.key}`} className="underline">Read the review</Link>.
            </p>
          ) : (
            <p className="py-4 text-sm text-stone-400">
              A plain-English look at the month: what went well, what to watch, and where money could
              be saved.{" "}
              <Link href={`/finance/review?m=${month.key}`} className="underline">
                {canEdit ? "Create this month's review" : "See reviews"}
              </Link>
            </p>
          )}
        </div>
      </div>

      {/* Budgets */}
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Spending by category</h2>
          <Link href={`/finance/transactions?m=${month.key}`} className="text-sm text-stone-500 underline">
            All transactions ({all.length})
          </Link>
        </div>
        {catRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-400">No categorised spending this month yet.</p>
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
                      <div className={`h-full rounded-full ${over ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Latest activity + quick actions */}
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Latest activity</h2>
          <div className="flex items-center gap-3 text-sm">
            {canEdit && (
              <>
                <Link href="/finance/import" className="text-stone-500 underline">Import CSV</Link>
                <Link href="/finance/setup" className="text-stone-500 underline">Setup</Link>
              </>
            )}
            <Link href={`/finance/transactions?m=${month.key}`} className="text-stone-500 underline">All</Link>
          </div>
        </div>
        {(recent ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-400">No transactions yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {(recent ?? []).map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-14 shrink-0 text-stone-400">{fmtDay(t.posted_at)}</span>
                <span className="min-w-0 flex-1 truncate">{t.merchant ?? t.description}</span>
                <span className="hidden shrink-0 text-xs text-stone-400 sm:inline">
                  {t.is_transfer ? "🔁 Transfer" : t.category_id ? `${catById.get(t.category_id)?.icon ?? ""} ${catById.get(t.category_id)?.name ?? ""}` : "—"}
                </span>
                <span className={`shrink-0 tabular-nums ${t.is_transfer ? "text-stone-400" : Number(t.amount) < 0 ? "text-stone-800" : "text-emerald-600"}`}>
                  {formatMoney(Number(t.amount), currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
