import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFinance, monthBounds, shiftMonth } from "@/lib/finance";
import { InsightsClient, type InsightTxn } from "@/components/insights-client";

const MONTHS = 6;

/**
 * Finance insights: a six-month dashboard — KPIs, income vs spending, savings
 * flow, the category × month matrix with drill-in, and top merchants.
 * Aggregation happens client-side from one slim row set (fetched per month to
 * stay under the API row cap).
 */
export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { membership } = await requireFinance("view");
  const { m } = await searchParams;
  const end = monthBounds(m);
  const currency = membership.household.base_currency;

  const monthKeys: string[] = [];
  for (let i = MONTHS - 1; i >= 0; i--) monthKeys.push(shiftMonth(end.key, -i));
  const months = monthKeys.map((k) => {
    const b = monthBounds(k);
    return { key: k, label: b.label, start: b.start, end: b.end };
  });

  const supabase = await createClient();
  const [{ data: categories }, { data: accounts }, ...monthResults] = await Promise.all([
    supabase
      .from("finance_categories")
      .select("id, name, icon, kind, parent_id")
      .eq("household_id", membership.household_id)
      .order("kind")
      .order("name"),
    supabase
      .from("finance_accounts")
      .select("id, name, type")
      .eq("household_id", membership.household_id)
      .order("name"),
    ...months.map((mo) =>
      supabase
        .from("finance_transactions")
        .select("id, posted_at, description, merchant, amount, category_id, scope, is_transfer, account_id")
        .eq("household_id", membership.household_id)
        .gte("posted_at", mo.start)
        .lte("posted_at", mo.end)
        .order("posted_at", { ascending: false })
    ),
  ]);

  const txns: InsightTxn[] = monthResults.flatMap((res, i) =>
    (res.data ?? []).map((t) => ({
      id: t.id as string,
      monthKey: months[i].key,
      posted_at: t.posted_at as string,
      description: t.description as string,
      merchant: (t.merchant as string | null) ?? null,
      amount: Number(t.amount),
      category_id: (t.category_id as string | null) ?? null,
      scope: t.scope as "household" | "personal",
      is_transfer: Boolean(t.is_transfer),
      account_id: (t.account_id as string | null) ?? null,
    }))
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/finance" className="text-xs text-stone-400 hover:underline">← Finance</Link>
          <h1 className="text-2xl font-semibold">📊 Insights</h1>
          <p className="mt-1 text-sm text-stone-400">
            The last {MONTHS} months of household money — transfers and personal spending excluded, exactly like your budgets.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/finance/insights?m=${shiftMonth(end.key, -1)}`}
            className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100"
          >
            ←
          </Link>
          <span className="min-w-44 text-center text-sm font-medium">
            {months[0].label} – {end.label}
          </span>
          <Link
            href={`/finance/insights?m=${shiftMonth(end.key, 1)}`}
            className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100"
          >
            →
          </Link>
        </div>
      </div>

      <InsightsClient
        months={months.map(({ key, label }) => ({ key, label }))}
        txns={txns}
        categories={categories ?? []}
        accounts={accounts ?? []}
        currency={currency}
      />
    </div>
  );
}
