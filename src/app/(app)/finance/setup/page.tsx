import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFinance, formatMoney } from "@/lib/finance";
import { addAccount, addCategory, seedCategories, setBudget } from "@/lib/actions/finance";
import { inputCls } from "@/components/auth-card";

export default async function FinanceSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { membership } = await requireFinance("edit");
  const { error, saved } = await searchParams;
  const currency = membership.household.base_currency;

  const supabase = await createClient();
  const [{ data: accounts }, { data: categories }, { data: budgets }] = await Promise.all([
    supabase.from("finance_accounts").select("id, name, type, institution").eq("household_id", membership.household_id).order("name"),
    supabase.from("finance_categories").select("id, name, icon, kind").eq("household_id", membership.household_id).order("kind").order("name"),
    supabase.from("finance_budgets").select("category_id, amount").eq("household_id", membership.household_id),
  ]);
  const budgetMap = new Map((budgets ?? []).map((b) => [b.category_id, Number(b.amount)]));
  const expenseCats = (categories ?? []).filter((c) => c.kind === "expense");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/finance" className="text-xs text-stone-400 hover:underline">← Finance</Link>
        <h1 className="text-2xl font-semibold">Finance setup</h1>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Saved.</p>}

      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <h2 className="text-sm font-semibold">Accounts</h2>
        <p className="mt-1 text-xs text-stone-400">One per bank account / card you&apos;ll import transactions for.</p>
        {(accounts ?? []).length > 0 && (
          <ul className="mt-3 space-y-1">
            {(accounts ?? []).map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                <span className="font-medium">{a.name}</span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs capitalize text-stone-500">{a.type}</span>
                {a.institution && <span className="text-xs text-stone-400">{a.institution}</span>}
              </li>
            ))}
          </ul>
        )}
        <form action={addAccount} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-44 flex-1">
            <label className="mb-1 block text-xs font-medium">Name</label>
            <input name="name" required placeholder="e.g. NAB Everyday" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Type</label>
            <select name="type" className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
              <option value="bank">bank</option>
              <option value="credit">credit</option>
              <option value="savings">savings</option>
              <option value="cash">cash</option>
              <option value="other">other</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Institution</label>
            <input name="institution" placeholder="NAB" className={`${inputCls} w-32`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Opening balance</label>
            <input name="opening_balance" type="number" step="0.01" placeholder="0.00" className={`${inputCls} w-32`} />
          </div>
          <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">Add</button>
        </form>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Categories</h2>
          {(categories ?? []).length === 0 && (
            <form action={seedCategories}>
              <button className="rounded-lg bg-stone-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-700">
                Load starter categories
              </button>
            </form>
          )}
        </div>
        {(categories ?? []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(categories ?? []).map((c) => (
              <span key={c.id} className={`rounded-full px-2.5 py-1 text-xs ${c.kind === "income" ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}`}>
                {c.icon} {c.name}
              </span>
            ))}
          </div>
        )}
        <form action={addCategory} className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium">Icon</label>
            <input name="icon" placeholder="🐾" className={`${inputCls} w-16 text-center`} />
          </div>
          <div className="min-w-44 flex-1">
            <label className="mb-1 block text-xs font-medium">Name</label>
            <input name="name" required placeholder="e.g. Pets" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Kind</label>
            <select name="kind" className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
              <option value="expense">expense</option>
              <option value="income">income</option>
            </select>
          </div>
          <button className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100">Add</button>
        </form>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <h2 className="text-sm font-semibold">Monthly budgets</h2>
        <p className="mt-1 text-xs text-stone-400">Set to 0 to remove a budget. Shown on the Finance overview.</p>
        {expenseCats.length === 0 ? (
          <p className="mt-4 text-sm text-stone-400">Add categories first.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {expenseCats.map((c) => (
              <form key={c.id} action={setBudget} className="flex items-center gap-3">
                <input type="hidden" name="category_id" value={c.id} />
                <span className="w-48 truncate text-sm">{c.icon} {c.name}</span>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={budgetMap.get(c.id) ?? ""}
                  placeholder="—"
                  className="w-28 rounded-lg border border-stone-300 px-2 py-1 text-right text-sm"
                />
                <button className="rounded-lg border border-stone-200 px-2.5 py-1 text-xs text-stone-500 hover:bg-stone-100">Save</button>
                {budgetMap.get(c.id) !== undefined && (
                  <span className="text-xs text-stone-400">{formatMoney(budgetMap.get(c.id)!, currency)}/mo</span>
                )}
              </form>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
