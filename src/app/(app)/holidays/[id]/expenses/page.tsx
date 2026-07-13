import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { formatMoney } from "@/lib/finance";
import { computeBalances, settle } from "@/lib/settlement";
import { deleteExpense } from "@/lib/actions/trips";
import { removeReceipt } from "@/lib/actions/receipts";
import { AddExpenseForm } from "@/components/add-expense-form";
import { TripTabs } from "@/components/trip-tabs";

export default async function TripExpensesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { membership, access } = await requireModule("holidays", "view");
  const { id } = await params;
  const { error } = await searchParams;
  const currency = membership.household.base_currency;
  const canEdit = access === "edit";

  const supabase = await createClient();
  const [{ data: trip }, { data: participants }, { data: expenses }] = await Promise.all([
    supabase
      .from("trips")
      .select("id, name")
      .eq("id", id)
      .eq("household_id", membership.household_id)
      .maybeSingle(),
    supabase.from("trip_participants").select("id, name, user_id").eq("trip_id", id).order("created_at"),
    supabase
      .from("trip_expenses")
      .select("id, description, amount, spent_at, paid_by, receipt_photo_id")
      .eq("trip_id", id)
      .order("spent_at", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (!trip) notFound();

  const expenseIds = (expenses ?? []).map((e) => e.id);
  const { data: shares } = expenseIds.length
    ? await supabase
        .from("trip_expense_shares")
        .select("expense_id, participant_id, amount")
        .in("expense_id", expenseIds)
    : { data: [] as { expense_id: string; participant_id: string; amount: number }[] };

  // signed urls for receipts
  const receiptIds = (expenses ?? []).map((e) => e.receipt_photo_id).filter(Boolean) as string[];
  const { data: receiptPhotos } = receiptIds.length
    ? await supabase.from("photos").select("id, storage_path").in("id", receiptIds)
    : { data: [] as { id: string; storage_path: string }[] };
  const signed = (receiptPhotos ?? []).length
    ? (
        await supabase.storage
          .from("photos")
          .createSignedUrls((receiptPhotos ?? []).map((p) => p.storage_path), 3600)
      ).data
    : [];
  const receiptUrl = new Map<string, string>();
  for (const p of receiptPhotos ?? []) {
    const s = (signed ?? []).find((x) => x.path === p.storage_path);
    if (s?.signedUrl) receiptUrl.set(p.id, s.signedUrl);
  }

  const pList = participants ?? [];
  const pName = new Map(pList.map((p) => [p.id, p.name]));
  const balances = computeBalances(pList, expenses ?? [], shares ?? []);
  const transfers = settle(balances);
  const total = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const sharesByExpense = new Map<string, string[]>();
  for (const s of shares ?? []) {
    sharesByExpense.set(s.expense_id, [
      ...(sharesByExpense.get(s.expense_id) ?? []),
      pName.get(s.participant_id) ?? "?",
    ]);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href={`/holidays/${trip.id}`} className="text-xs text-stone-400 hover:underline">← {trip.name}</Link>
        <h1 className="text-2xl font-semibold">💸 Split the bill</h1>
      </div>
      <TripTabs tripId={trip.id} />
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {canEdit && pList.length > 0 && (
            <AddExpenseForm tripId={trip.id} participants={pList.map((p) => ({ id: p.id, name: p.name }))} />
          )}

          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
              <h2 className="text-sm font-semibold">Expenses</h2>
              <span className="text-sm text-stone-500">
                Total: <span className="font-medium">{formatMoney(total, currency)}</span>
              </span>
            </div>
            {(expenses ?? []).length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-stone-400">Nothing spent yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {(expenses ?? []).map((e, i) => (
                    <tr key={e.id} className={`border-b border-stone-100 ${i % 2 ? "bg-stone-50" : ""}`}>
                      <td className="whitespace-nowrap px-4 py-2 text-stone-500">
                        {new Date(e.spent_at).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium">
                          {e.description}
                          {e.receipt_photo_id && receiptUrl.get(e.receipt_photo_id) && (
                            <span className="ml-2 inline-flex items-center gap-1">
                              <a
                                href={receiptUrl.get(e.receipt_photo_id)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-sky-600 underline"
                              >
                                receipt
                              </a>
                              {canEdit && (
                                <form action={removeReceipt} className="inline">
                                  <input type="hidden" name="expense_id" value={e.id} />
                                  <input type="hidden" name="trip_id" value={trip.id} />
                                  <button className="text-[10px] text-stone-300 hover:text-red-600" title="Delete receipt scan">✕</button>
                                </form>
                              )}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-stone-400">
                          {pName.get(e.paid_by)} paid · split {(sharesByExpense.get(e.id) ?? []).join(", ")}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right font-medium">
                        {formatMoney(Number(e.amount), currency)}
                      </td>
                      {canEdit && (
                        <td className="px-2 py-2 text-right">
                          <form action={deleteExpense}>
                            <input type="hidden" name="expense_id" value={e.id} />
                            <input type="hidden" name="trip_id" value={trip.id} />
                            <button className="rounded px-1.5 py-1 text-xs text-stone-300 hover:bg-red-50 hover:text-red-600">✕</button>
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

        <div className="space-y-6">
          <div className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold">Balances</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {balances.map((b) => (
                <li key={b.participantId} className="flex items-center justify-between">
                  <span>{b.name}</span>
                  <span className={b.net > 0.004 ? "font-medium text-emerald-600" : b.net < -0.004 ? "font-medium text-red-600" : "text-stone-400"}>
                    {b.net > 0.004 ? "is owed " : b.net < -0.004 ? "owes " : "settled"}
                    {Math.abs(b.net) > 0.004 && formatMoney(Math.abs(b.net), currency)}
                  </span>
                </li>
              ))}
            </ul>
            {transfers.length > 0 && (
              <>
                <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-stone-400">To settle up</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {transfers.map((t, i) => (
                    <li key={i} className="rounded-lg bg-stone-50 px-3 py-1.5">
                      <span className="font-medium">{t.from}</span> pays{" "}
                      <span className="font-medium">{t.to}</span>{" "}
                      <span className="font-semibold">{formatMoney(t.amount, currency)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
