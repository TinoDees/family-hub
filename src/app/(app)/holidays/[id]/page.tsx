import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { formatMoney } from "@/lib/finance";
import { computeBalances, settle } from "@/lib/settlement";
import {
  addParticipant,
  removeParticipant,
  addExpense,
  deleteExpense,
  deleteTrip,
  setTripStatus,
} from "@/lib/actions/trips";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { inputCls } from "@/components/auth-card";

export default async function TripPage({
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
      .select("id, name, destination, start_date, end_date, status")
      .eq("id", id)
      .eq("household_id", membership.household_id)
      .maybeSingle(),
    supabase
      .from("trip_participants")
      .select("id, name, user_id")
      .eq("trip_id", id)
      .order("created_at"),
    supabase
      .from("trip_expenses")
      .select("id, description, amount, spent_at, paid_by, notes")
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/holidays" className="text-xs text-stone-400 hover:underline">← Trips</Link>
          <h1 className="text-2xl font-semibold">{trip.name}</h1>
          <p className="text-sm text-stone-500">
            {trip.destination ?? ""}
            {trip.start_date &&
              ` · ${new Date(trip.start_date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`}
            {trip.end_date &&
              ` – ${new Date(trip.end_date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`}
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <form action={setTripStatus}>
              <input type="hidden" name="trip_id" value={trip.id} />
              <input type="hidden" name="status" value={trip.status === "completed" ? "active" : "completed"} />
              <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100">
                {trip.status === "completed" ? "Reopen trip" : "Mark completed"}
              </button>
            </form>
            <form action={deleteTrip}>
              <input type="hidden" name="trip_id" value={trip.id} />
              <ConfirmSubmit
                label="Delete"
                confirmMessage={`Delete "${trip.name}" including all its expenses?`}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              />
            </form>
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {canEdit && pList.length > 0 && (
            <form action={addExpense} className="space-y-3 rounded-xl border border-stone-200 bg-white p-5">
              <h2 className="text-sm font-semibold">Add expense</h2>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-44 flex-1">
                  <label className="mb-1 block text-xs font-medium">Description</label>
                  <input name="description" required placeholder="e.g. Dinner at the surf club" className={inputCls} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Amount</label>
                  <input name="amount" type="number" step="0.01" min="0.01" required placeholder="0.00" className={`${inputCls} w-28`} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Date</label>
                  <input name="spent_at" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputCls} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Paid by</label>
                  <select name="paid_by" className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
                    {pList.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium">Split between</div>
                <div className="flex flex-wrap gap-3">
                  {pList.map((p) => (
                    <label key={p.id} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" name="shared_with" value={p.id} defaultChecked className="rounded border-stone-300" />
                      {p.name}
                    </label>
                  ))}
                </div>
              </div>
              <input type="hidden" name="trip_id" value={trip.id} />
              <button className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700">
                Add — split equally
              </button>
            </form>
          )}

          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
              <h2 className="text-sm font-semibold">Expenses</h2>
              <span className="text-sm text-stone-500">
                Total: <span className="font-medium">{formatMoney(total, currency)}</span>
              </span>
            </div>
            {(expenses ?? []).length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-stone-400">Nothing spent yet. Enjoy it while it lasts.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {(expenses ?? []).map((e, i) => (
                    <tr key={e.id} className={`border-b border-stone-100 ${i % 2 ? "bg-stone-50" : ""}`}>
                      <td className="whitespace-nowrap px-4 py-2 text-stone-500">
                        {new Date(e.spent_at).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium">{e.description}</div>
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
            <h2 className="text-sm font-semibold">Who&apos;s on the trip</h2>
            <ul className="mt-3 space-y-1.5">
              {pList.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span>
                    {p.name}
                    {!p.user_id && <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-400">no account</span>}
                  </span>
                  {canEdit && (
                    <form action={removeParticipant}>
                      <input type="hidden" name="participant_id" value={p.id} />
                      <input type="hidden" name="trip_id" value={trip.id} />
                      <button className="text-xs text-stone-300 hover:text-red-600">remove</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            {canEdit && (
              <form action={addParticipant} className="mt-3 flex gap-2">
                <input type="hidden" name="trip_id" value={trip.id} />
                <input name="name" required placeholder="e.g. Michael Schmidt" className={`${inputCls} flex-1`} />
                <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-100">Add</button>
              </form>
            )}
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold">Balances</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {balances.map((b) => (
                <li key={b.participantId} className="flex items-center justify-between">
                  <span>{b.name}</span>
                  <span className={b.net > 0.004 ? "font-medium text-emerald-600" : b.net < -0.004 ? "font-medium text-red-600" : "text-stone-400"}>
                    {b.net > 0.004 ? "is owed " : b.net < -0.004 ? "owes " : "settled "}
                    {b.net !== 0 && formatMoney(Math.abs(b.net), currency)}
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
