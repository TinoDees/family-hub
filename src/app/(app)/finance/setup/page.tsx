import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFinance } from "@/lib/finance";
import { addAccount, seedCategories } from "@/lib/actions/finance";
import { CategoriesGrid } from "@/components/categories-grid";
import { inputCls } from "@/components/auth-card";

export default async function FinanceSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; sec?: string }>;
}) {
  const { membership } = await requireFinance("edit");
  const { error, saved, sec } = await searchParams;
  const banner = (section: string) =>
    sec === section ? (
      <>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {saved && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✅ Saved.</p>}
      </>
    ) : null;
  const currency = membership.household.base_currency;

  const supabase = await createClient();
  const [{ data: accounts }, { data: categories }, { data: budgets }] = await Promise.all([
    supabase.from("finance_accounts").select("id, name, type, institution").eq("household_id", membership.household_id).order("name"),
    supabase.from("finance_categories").select("id, name, icon, kind, parent_id").eq("household_id", membership.household_id).order("kind").order("name"),
    supabase.from("finance_budgets").select("category_id, amount").eq("household_id", membership.household_id),
  ]);
  const budgetMap = Object.fromEntries((budgets ?? []).map((b) => [b.category_id, Number(b.amount)]));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/finance" className="text-xs text-stone-400 hover:underline">← Finance</Link>
        <h1 className="text-2xl font-semibold">Finance setup</h1>
        <p className="mt-1 text-sm text-stone-400">
          Your accounts, categories and monthly budgets — everything the Finance module runs on.
        </p>
      </div>

      {!sec && error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!sec && saved && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Saved.</p>}

      <div id="accounts" className="scroll-mt-6 overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="px-6 pt-5">
          <h2 className="text-sm font-semibold">Accounts</h2>
          <p className="mt-1 text-xs text-stone-400">One per bank account / card you&apos;ll import transactions for. Ownership, balances and deletion live on <Link href="/finance/accounts" className="underline underline-offset-2 hover:text-stone-600">Accounts</Link>.</p>
          {banner("accounts")}
        </div>
        {(accounts ?? []).length > 0 && (
          <div className="mt-4 border-t border-stone-100">
            {(accounts ?? []).map((a, i) => (
              <div key={a.id} className={`flex items-center gap-3 px-6 py-2.5 text-sm ${i % 2 ? "bg-stone-50" : ""}`}>
                <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs capitalize text-stone-500">{a.type}</span>
                <span className="w-24 truncate text-right text-xs text-stone-400">{a.institution ?? ""}</span>
              </div>
            ))}
          </div>
        )}
        <form action={addAccount} className="flex flex-wrap items-end gap-3 border-t border-stone-100 bg-stone-50/60 px-6 py-4">
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

      <div id="categories" className="scroll-mt-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Categories &amp; budgets</h2>
            <p className="mt-0.5 text-xs text-stone-400">
              Edit straight in the sheet — click a name, emoji or kind to change it, and type a monthly budget on any expense row.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/finance/rules"
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
            >
              📖 Rule book →
            </Link>
            {(categories ?? []).length === 0 && (
              <form action={seedCategories}>
                <button className="rounded-lg bg-stone-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-700">
                  Load starter categories
                </button>
              </form>
            )}
          </div>
        </div>
        {banner("categories")}
        <CategoriesGrid categories={categories ?? []} budgets={budgetMap} currency={currency} />
      </div>
    </div>
  );
}
