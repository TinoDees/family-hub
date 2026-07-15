import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFinance } from "@/lib/finance";
import { CsvImport } from "@/components/csv-import";

export default async function ImportPage() {
  const { membership } = await requireFinance("edit");
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("finance_accounts")
    .select("id, name")
    .eq("household_id", membership.household_id)
    .order("name");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/finance" className="text-xs text-stone-400 hover:underline">← Finance</Link>
        <h1 className="text-2xl font-semibold">Import bank transactions</h1>
      </div>
      {(accounts ?? []).length === 0 ? (
        <p className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
          Add an account first under{" "}
          <Link href="/finance/setup" className="font-medium underline">Finance setup</Link>.
        </p>
      ) : (
        <CsvImport accounts={accounts ?? []} />
      )}
      <p className="text-xs text-stone-400">
        Re-importing the same file is safe — duplicates are detected and skipped automatically.
        The balance column isn&apos;t needed: Nestly works balances out itself. If your bank&apos;s
        CSV has a category column, matching categories are applied automatically.
      </p>

      <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
        <h2 className="text-sm font-semibold text-teal-900">⚡ Want automatic feeds instead of CSVs?</h2>
        <p className="mt-1 text-sm text-teal-800">
          <a href="https://redbark.com" target="_blank" rel="noreferrer" className="font-medium underline">Redbark</a>{" "}
          connects your Australian banks through the government&apos;s Consumer Data Right and syncs
          transactions automatically (their subscription, 7-day free trial). Set it up with Google
          Sheets as the destination — Nestly&apos;s automatic ingestion of that feed is coming soon,
          and until then you can export from the sheet and import here.
        </p>
        <ol className="mt-2 list-decimal pl-5 text-sm text-teal-800">
          <li>Create a Redbark account and connect your bank + cards (takes minutes)</li>
          <li>Choose Google Sheets as the destination</li>
          <li>Weekly: download the sheet as CSV → import it here (duplicates auto-skip)</li>
        </ol>
      </div>
    </div>
  );
}
