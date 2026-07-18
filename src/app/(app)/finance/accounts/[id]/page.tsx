import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFinance, formatMoney, monthBounds, shiftMonth } from "@/lib/finance";
import { TransactionsGrid } from "@/components/transactions-grid";

// AI category suggestions batch can exceed the default function budget
export const maxDuration = 60;

const TYPE_ICON: Record<string, string> = {
  bank: "🏦",
  savings: "🌱",
  cash: "💵",
  credit: "💳",
  other: "📁",
};

const TXN_FIELDS =
  "id, posted_at, description, merchant, amount, category_id, suggested_category_id, source, account_id, is_transfer, scope, status, reviewed, transfer_pair:transfer_pair_id(account_id)";

type Txn = {
  id: string;
  posted_at: string;
  description: string;
  merchant: string | null;
  amount: number | string;
  category_id: string | null;
  suggested_category_id: string | null;
  source: string;
  account_id: string | null;
  is_transfer: boolean;
  scope: "household" | "personal";
  reviewed: boolean;
  /** the matching leg's account — lets the grid say WHAT a transfer is (savings, card payment).
   *  PostgREST types embedded FK joins as arrays even when to-one, so accept both shapes. */
  transfer_pair: { account_id: string | null } | { account_id: string | null }[] | null;
};

/** Normalise the embedded pair join (object at runtime, array per the types). */
function pairAccountId(p: Txn["transfer_pair"]): string | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0]?.account_id ?? null) : p.account_id;
}

function syncedAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "synced just now";
  if (mins < 60) return `synced ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `synced ${hrs} hour${hrs === 1 ? "" : "s"} ago`;
}

/** A row is fully dealt with: confirmed category, or flagged as a transfer. */
function isSorted(t: Txn) {
  return t.is_transfer || (t.category_id !== null && t.reviewed);
}

/** One account: balance, the "To sort" inbox, the Sorted history, and All. */
export default async function AccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; m?: string }>;
}) {
  const { membership, access } = await requireFinance("view");
  const { id } = await params;
  const { view: viewParam, m } = await searchParams;
  const month = monthBounds(m);
  const currency = membership.household.base_currency;
  const canEdit = access === "edit";

  const supabase = await createClient();
  const [{ data: account }, { data: sums }, { data: inbox }, { data: monthTxns }, { data: categories }, { data: allAccounts }] =
    await Promise.all([
      supabase
        .from("finance_accounts")
        .select(
          "id, name, type, institution, opening_balance, external_id, bank_balance, bank_available, balance_synced_at"
        )
        .eq("household_id", membership.household_id)
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("finance_transactions")
        .select("amount")
        .eq("household_id", membership.household_id)
        .eq("account_id", id),
      // the inbox: needs a person's attention — no category yet, OR a rule
      // filled the category and it still awaits its confirmation tick
      supabase
        .from("finance_transactions")
        .select(TXN_FIELDS)
        .eq("household_id", membership.household_id)
        .eq("account_id", id)
        .eq("is_transfer", false)
        .or("category_id.is.null,reviewed.is.false")
        .order("posted_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("finance_transactions")
        .select(TXN_FIELDS)
        .eq("household_id", membership.household_id)
        .eq("account_id", id)
        .gte("posted_at", month.start)
        .lte("posted_at", month.end)
        .order("posted_at", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("finance_categories")
        .select("id, name, icon, kind")
        .eq("household_id", membership.household_id)
        .order("name"),
      // every account's type, so transfer pills can say "To savings" / "Card payment"
      supabase
        .from("finance_accounts")
        .select("id, name, type")
        .eq("household_id", membership.household_id)
        .order("name"),
    ]);

  // account must belong to this household
  if (!account) redirect("/finance");

  const txnSum = (sums ?? []).reduce((s, t) => s + Number(t.amount), 0);
  const live = account.bank_balance !== null && account.bank_balance !== undefined;
  const balance = live ? Number(account.bank_balance) : Number(account.opening_balance) + txnSum;
  const available =
    account.bank_available !== null && account.bank_available !== undefined
      ? Number(account.bank_available)
      : null;

  const toSort = (inbox ?? []) as Txn[];
  const toSortCount = toSort.length;
  const monthRows = (monthTxns ?? []) as Txn[];
  const sortedRows = monthRows.filter(isSorted);
  const view =
    viewParam === "all" ? "all"
    : viewParam === "sorted" ? "sorted"
    : viewParam === "sort" ? "sort"
    : toSortCount > 0 ? "sort" : "all";

  const sourceRows = view === "sort" ? toSort : view === "sorted" ? sortedRows : monthRows;
  const gridRows = sourceRows.map((t) => ({
    id: t.id,
    posted_at: t.posted_at,
    description: t.description,
    merchant: t.merchant,
    amount: Number(t.amount),
    category_id: t.category_id,
    suggested_category_id: t.suggested_category_id,
    source: t.source,
    is_transfer: t.is_transfer,
    scope: t.scope,
    account_id: t.account_id,
    reviewed: t.reviewed,
    pair_account_id: pairAccountId(t.transfer_pair),
  }));

  const tab = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${
      active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"
    }`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/finance" className="text-xs text-stone-400 hover:underline">← Finance</Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <span>{TYPE_ICON[account.type] ?? "📁"}</span> {account.name}
          </h1>
          {account.institution && <p className="text-sm text-stone-500">{account.institution}</p>}
        </div>
        <div className="sm:text-right">
          <div className={`text-3xl font-semibold tabular-nums ${balance < 0 ? "text-red-600" : ""}`}>
            {formatMoney(balance, currency)}
          </div>
          <div className="flex items-center gap-2 text-xs text-stone-400 sm:justify-end">
            {available !== null && <span>{formatMoney(available, currency)} available</span>}
            {account.external_id && live && (
              <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> live
              </span>
            )}
            {account.balance_synced_at && <span>{syncedAgo(account.balance_synced_at)}</span>}
          </div>
          <Link href="/finance/accounts" className="text-xs text-stone-400 hover:underline">
            Manage accounts →
          </Link>
        </div>
      </div>

      {/* Segmented control + month nav (Sorted and All views) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white p-1">
          <Link href={`/finance/accounts/${account.id}?view=sort`} className={tab(view === "sort")}>
            To sort ({toSortCount})
          </Link>
          <Link href={`/finance/accounts/${account.id}?view=sorted&m=${month.key}`} className={tab(view === "sorted")}>
            ✓ Sorted
          </Link>
          <Link href={`/finance/accounts/${account.id}?view=all&m=${month.key}`} className={tab(view === "all")}>
            All
          </Link>
        </div>
        {view !== "sort" && (
          <div className="flex items-center gap-3">
            <Link
              href={`/finance/accounts/${account.id}?view=${view}&m=${shiftMonth(month.key, -1)}`}
              className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100"
            >
              ←
            </Link>
            <span className="min-w-36 text-center text-sm font-medium">{month.label}</span>
            <Link
              href={`/finance/accounts/${account.id}?view=${view}&m=${shiftMonth(month.key, 1)}`}
              className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100"
            >
              →
            </Link>
          </div>
        )}
      </div>

      {view === "sort" && toSortCount === 0 ? (
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-8 text-center">
          <div className="text-2xl">🎉</div>
          <p className="mt-1 text-sm font-medium text-teal-800">All sorted!</p>
          <p className="mt-1 text-sm text-teal-700">
            Every transaction on this account is confirmed or marked as a transfer.{" "}
            <Link href={`/finance/accounts/${account.id}?view=sorted`} className="underline">
              See what&apos;s sorted
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          {view === "sort" && (
            <p className="text-sm text-stone-500">
              {toSortCount === 500 ? "Showing the newest 500 — sort these first." : (
                <>Needs a person&apos;s eye — pick a category, or tick 🪄 auto-filled ones to confirm. Sorted rows leave this list straight away.</>
              )}
            </p>
          )}
          {view === "sorted" && (
            <p className="text-sm text-stone-500">
              Everything confirmed (or flagged as a transfer) in {month.label} — your reconciled history.
            </p>
          )}
          <TransactionsGrid
            rows={gridRows}
            categories={categories ?? []}
            accounts={allAccounts ?? [{ id: account.id, name: account.name, type: account.type }]}
            canEdit={canEdit}
            currency={currency}
            monthKey={month.key}
            statusPill={view !== "sort"}
            hideAccountColumn
            storageKey="account"
            removeWhenSorted={view === "sort"}
          />
        </>
      )}
    </div>
  );
}
