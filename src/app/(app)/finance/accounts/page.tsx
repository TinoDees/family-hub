import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFinance, formatMoney } from "@/lib/finance";
import { updateAccount, deleteAccount, requestAccountDeletion, cancelAccountDeletion } from "@/lib/actions/finance";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { inputCls } from "@/components/auth-card";

const TYPE_META: Record<string, { label: string; liability: boolean; icon: string }> = {
  bank: { label: "Bank", liability: false, icon: "🏦" },
  savings: { label: "Savings", liability: false, icon: "🌱" },
  cash: { label: "Cash", liability: false, icon: "💵" },
  credit: { label: "Credit card", liability: true, icon: "💳" },
  other: { label: "Other", liability: false, icon: "📁" },
};

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { membership, access } = await requireFinance("view");
  const isOwner = membership.role === "owner";
  const { error, saved } = await searchParams;
  const currency = membership.household.base_currency;
  const canEdit = access === "edit";

  const supabase = await createClient();
  const [{ data: accounts }, { data: sums }] = await Promise.all([
    supabase
      .from("finance_accounts")
      .select("id, name, type, institution, opening_balance, deletion_requested_by, deletion_requested_at")
      .eq("household_id", membership.household_id)
      .order("type")
      .order("name"),
    supabase
      .from("finance_transactions")
      .select("account_id, amount")
      .eq("household_id", membership.household_id)
      .not("account_id", "is", null),
  ]);

  const txnSum = new Map<string, number>();
  const txnCount = new Map<string, number>();
  for (const t of sums ?? []) {
    txnSum.set(t.account_id!, (txnSum.get(t.account_id!) ?? 0) + Number(t.amount));
    txnCount.set(t.account_id!, (txnCount.get(t.account_id!) ?? 0) + 1);
  }

  const withBalance = (accounts ?? []).map((a) => ({
    ...a,
    balance: Number(a.opening_balance) + (txnSum.get(a.id) ?? 0),
    txns: txnCount.get(a.id) ?? 0,
    meta: TYPE_META[a.type] ?? TYPE_META.other,
  }));
  const assets = withBalance.filter((a) => !a.meta.liability).reduce((s, a) => s + a.balance, 0);
  const liabilities = withBalance.filter((a) => a.meta.liability).reduce((s, a) => s + a.balance, 0);
  const net = assets + liabilities;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/finance" className="text-xs text-stone-400 hover:underline">← Finance</Link>
        <h1 className="text-2xl font-semibold">Accounts</h1>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Saved.</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Assets</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-600">{formatMoney(assets, currency)}</div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Liabilities</div>
          <div className="mt-1 text-2xl font-semibold text-red-600">{formatMoney(liabilities, currency)}</div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Net position</div>
          <div className={`mt-1 text-2xl font-semibold ${net >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {formatMoney(net, currency)}
          </div>
        </div>
      </div>

      {withBalance.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-400">
          No accounts yet — add your bank accounts and cards under{" "}
          <Link href="/finance/setup" className="underline">Setup</Link>.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {withBalance.map((a) => (
            <div key={a.id} className="rounded-xl border border-stone-200 bg-white p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <span>{a.meta.icon}</span> {a.name}
                    <span className={`rounded-full px-2 py-0.5 text-xs ${a.meta.liability ? "bg-red-50 text-red-600" : "bg-stone-100 text-stone-500"}`}>
                      {a.meta.label}
                    </span>
                  </div>
                  {a.institution && <div className="text-xs text-stone-400">{a.institution}</div>}
                </div>
                <div className={`text-right text-xl font-semibold tabular-nums ${a.balance < 0 ? "text-red-600" : ""}`}>
                  {formatMoney(a.balance, currency)}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-stone-400">
                <Link href={`/finance/transactions?account=${a.id}`} className="underline">
                  {a.txns} transaction{a.txns === 1 ? "" : "s"}
                </Link>
                <span>opening {formatMoney(Number(a.opening_balance), currency)}</span>
              </div>
              {canEdit && (
                <details className="mt-3 border-t border-stone-100 pt-2">
                  <summary className="cursor-pointer text-xs text-stone-400">Edit</summary>
                  <form action={updateAccount} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="account_id" value={a.id} />
                    <div className="min-w-32 flex-1">
                      <label className="mb-1 block text-[10px] font-medium uppercase text-stone-400">Name</label>
                      <input name="name" defaultValue={a.name} className={inputCls} />
                    </div>
                    <div className="w-32">
                      <label className="mb-1 block text-[10px] font-medium uppercase text-stone-400">Opening balance</label>
                      <input name="opening_balance" type="number" step="0.01" defaultValue={Number(a.opening_balance)} className={inputCls} />
                    </div>
                    <button className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium hover:bg-stone-100">Save</button>
                  </form>
                  {a.deletion_requested_by && (
                    <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      🗑️ Deletion requested {a.deletion_requested_at && `on ${new Date(a.deletion_requested_at).toLocaleDateString("en-AU")}`}
                      {isOwner ? " — approve below or dismiss." : " — waiting for the owner to approve."}
                      <form action={cancelAccountDeletion} className="mt-1 inline">
                        <input type="hidden" name="account_id" value={a.id} />
                        <button className="text-xs underline">Dismiss request</button>
                      </form>
                    </div>
                  )}
                  {isOwner ? (
                  <form action={deleteAccount} className="mt-2">
                    <input type="hidden" name="account_id" value={a.id} />
                    <ConfirmSubmit
                      label={a.deletion_requested_by ? "Approve — delete account" : "Delete account"}
                      confirmMessage={`Delete "${a.name}" and ALL ${a.txns} of its transactions? This cannot be undone.`}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    />
                  </form>
                  ) : !a.deletion_requested_by ? (
                    <form action={requestAccountDeletion} className="mt-2">
                      <input type="hidden" name="account_id" value={a.id} />
                      <ConfirmSubmit
                        label="Request deletion"
                        confirmMessage={`Ask the owner to delete "${a.name}"? They'll get a notification and decide.`}
                        className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
                      />
                    </form>
                  ) : null}
                </details>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-stone-400">
        Balance = opening balance + all imported/manual transactions. Credit cards count as
        liabilities in the net position. Budgets, savings goals and loans come next.
      </p>
    </div>
  );
}
