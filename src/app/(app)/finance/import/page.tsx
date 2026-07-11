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
      </p>
    </div>
  );
}
