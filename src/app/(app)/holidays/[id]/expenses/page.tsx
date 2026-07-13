import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { formatMoney } from "@/lib/finance";
import { computeBalances, settle } from "@/lib/settlement";
import { deleteExpense } from "@/lib/actions/trips";
import { removeReceipt } from "@/lib/actions/receipts";
import { ExpenseSplitModal } from "@/components/expense-split-modal";
import { FamilySpendModal, type FamilyDetailRow } from "@/components/family-spend-modal";
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
  const [{ data: trip }, { data: participants }, { data: expenses }, { data: families }] = await Promise.all([
    supabase
      .from("trips")
      .select("id, name")
      .eq("id", id)
      .eq("household_id", membership.household_id)
      .maybeSingle(),
    supabase.from("trip_participants").select("id, name, user_id, family_id").eq("trip_id", id).order("created_at"),
    supabase
      .from("trip_expenses")
      .select("id, description, amount, spent_at, paid_by, receipt_photo_id, is_treat, original_amount, original_currency")
      .eq("trip_id", id)
      .order("spent_at", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("trip_families").select("id, name").eq("trip_id", id).order("created_at"),
  ]);
  if (!trip) notFound();

  const expenseIds = (expenses ?? []).map((e) => e.id);
  const { data: allItems } = expenseIds.length
    ? await supabase
        .from("trip_expense_items")
        .select("id, expense_id, description, amount, consumed_by, position")
        .in("expense_id", expenseIds)
        .order("position")
    : { data: [] as { id: string; expense_id: string; description: string; amount: number; consumed_by: string | null; position: number }[] };
  const itemsByExpense = new Map<string, typeof allItems>();
  for (const it of allItems ?? []) {
    itemsByExpense.set(it.expense_id, [...(itemsByExpense.get(it.expense_id) ?? []), it]);
  }
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

  // family aggregation
  const familyOf = new Map(pList.map((p) => [p.id, p.family_id]));
  const expenseName = new Map((expenses ?? []).map((e) => [e.id, e.description]));
  const familyAgg = new Map<string, { paid: number; share: number; rows: FamilyDetailRow[] }>();
  const aggFor = (fid: string) => {
    if (!familyAgg.has(fid)) familyAgg.set(fid, { paid: 0, share: 0, rows: [] });
    return familyAgg.get(fid)!;
  };
  for (const e of expenses ?? []) {
    const fid = familyOf.get(e.paid_by);
    if (fid) aggFor(fid).paid += Number(e.amount);
  }
  const itemisedByParticipant = new Map<string, number>(); // participant|expense -> itemised sum
  for (const it of allItems ?? []) {
    if (it.consumed_by) {
      const fid = familyOf.get(it.consumed_by);
      if (fid) {
        aggFor(fid).rows.push({
          member: pName.get(it.consumed_by) ?? "?",
          expense: expenseName.get(it.expense_id) ?? "",
          item: it.description,
          amount: Number(it.amount),
        });
      }
      const k = `${it.consumed_by}|${it.expense_id}`;
      itemisedByParticipant.set(k, (itemisedByParticipant.get(k) ?? 0) + Number(it.amount));
    }
  }
  for (const sh of shares ?? []) {
    const fid = familyOf.get(sh.participant_id);
    if (!fid) continue;
    const agg = aggFor(fid);
    agg.share += Number(sh.amount);
    const itemised = itemisedByParticipant.get(`${sh.participant_id}|${sh.expense_id}`) ?? 0;
    const sharedPart = Math.round((Number(sh.amount) - itemised) * 100) / 100;
    if (sharedPart > 0.004) {
      agg.rows.push({
        member: pName.get(sh.participant_id) ?? "?",
        expense: expenseName.get(sh.expense_id) ?? "",
        item: "share of shared costs",
        amount: sharedPart,
      });
    }
  }
  const total = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const sharesByExpense = new Map<string, string[]>();
  const shareIdsByExpense = new Map<string, string[]>();
  for (const s of shares ?? []) {
    sharesByExpense.set(s.expense_id, [
      ...(sharesByExpense.get(s.expense_id) ?? []),
      pName.get(s.participant_id) ?? "?",
    ]);
    shareIdsByExpense.set(s.expense_id, [
      ...(shareIdsByExpense.get(s.expense_id) ?? []),
      s.participant_id,
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
                          {e.is_treat ? (
                            <span className="text-amber-600">🎁 treat — {pName.get(e.paid_by)} covered it</span>
                          ) : (
                            <>{pName.get(e.paid_by)} paid · split {(sharesByExpense.get(e.id) ?? []).join(", ")}</>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right font-medium">
                        {formatMoney(Number(e.amount), currency)}
                        {e.original_amount && e.original_currency && (
                          <div className="text-[10px] font-normal text-stone-400">
                            {e.original_currency} {Number(e.original_amount).toLocaleString()}
                          </div>
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-2 py-2 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {!e.is_treat && (
                            <ExpenseSplitModal
                              expense={{ id: e.id, description: e.description, amount: Number(e.amount) }}
                              receiptUrl={e.receipt_photo_id ? receiptUrl.get(e.receipt_photo_id) : undefined}
                              items={(itemsByExpense.get(e.id) ?? []).map((it) => ({
                                id: it.id,
                                description: it.description,
                                amount: Number(it.amount),
                                consumed_by: it.consumed_by,
                              }))}
                              participants={pList.map((p) => ({ id: p.id, name: p.name }))}
                              currentShareIds={shareIdsByExpense.get(e.id) ?? []}
                              currency={currency}
                            />
                            )}
                            <form action={deleteExpense}>
                              <input type="hidden" name="expense_id" value={e.id} />
                              <input type="hidden" name="trip_id" value={trip.id} />
                              <button className="rounded px-1.5 py-1 text-xs text-stone-300 hover:bg-red-50 hover:text-red-600">✕</button>
                            </form>
                          </div>
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
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
              <h2 className="text-sm font-semibold">Spend by family</h2>
              <span className="text-sm font-medium">{formatMoney(total, currency)}</span>
            </div>
            {(families ?? []).length === 0 ? (
              <p className="px-4 py-4 text-center text-sm text-stone-400">No families set up yet — see Overview.</p>
            ) : (
              <div className="divide-y divide-stone-100">
                {(families ?? []).map((f) => {
                  const agg = familyAgg.get(f.id) ?? { paid: 0, share: 0, rows: [] };
                  return (
                    <FamilySpendModal
                      key={f.id}
                      familyName={f.name}
                      paid={agg.paid}
                      share={agg.share}
                      rows={agg.rows}
                      currency={currency}
                    />
                  );
                })}
              </div>
            )}
            {(() => {
              const familyBalances = (families ?? []).map((f) => {
                const agg = familyAgg.get(f.id) ?? { paid: 0, share: 0, rows: [] };
                return {
                  participantId: f.id,
                  name: f.name,
                  paid: agg.paid,
                  share: agg.share,
                  net: Math.round((agg.paid - agg.share) * 100) / 100,
                };
              });
              const famTransfers = settle(familyBalances);
              return famTransfers.length > 0 ? (
                <div className="border-t border-stone-100 px-4 py-2.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                    Between families
                  </div>
                  <ul className="mt-1 space-y-1 text-sm">
                    {famTransfers.map((t, i) => (
                      <li key={i}>
                        <span className="font-medium">{t.from}</span> pays{" "}
                        <span className="font-medium">{t.to}</span>{" "}
                        <span className="font-semibold">{formatMoney(t.amount, currency)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null;
            })()}
            <p className="border-t border-stone-100 px-4 py-2 text-xs text-stone-400">
              Click a family for the itemised breakdown.
            </p>
          </div>

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
