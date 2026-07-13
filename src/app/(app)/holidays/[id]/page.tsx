import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { formatMoney } from "@/lib/finance";
import {
  addParticipant,
  removeParticipant,
  deleteTrip,
  setTripStatus,
  createTripInvite,
  addTripFamily,
  removeTripFamily,
  setAgreedRate,
} from "@/lib/actions/trips";
import { TripTabs } from "@/components/trip-tabs";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { CopyButton } from "@/components/copy-button";
import { AddFamilyMember } from "@/components/add-family-member";
import { inputCls } from "@/components/auth-card";

export default async function TripOverviewPage({
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
  const [
    { data: trip },
    { data: families },
    { data: participants },
    { data: expenses },
    { data: album },
    { data: fxRates },
    { data: invites },
  ] = await Promise.all([
    supabase
      .from("trips")
      .select("id, name, destination, start_date, end_date, status")
      .eq("id", id)
      .eq("household_id", membership.household_id)
      .maybeSingle(),
    supabase.from("trip_families").select("id, name, linked_household_id").eq("trip_id", id).order("created_at"),
    supabase
      .from("trip_participants")
      .select("id, name, user_id, family_id, email, is_manager")
      .eq("trip_id", id)
      .order("created_at"),
    supabase
      .from("trip_expenses")
      .select("id, amount, original_amount, original_currency")
      .eq("trip_id", id),
    supabase.from("albums").select("id, photos(count)").eq("trip_id", id).maybeSingle(),
    supabase.from("trip_fx_rates").select("currency, agreed_rate").eq("trip_id", id),
    supabase
      .from("trip_invites")
      .select("participant_id, token, expires_at")
      .eq("trip_id", id)
      .is("accepted_at", null)
      .is("revoked_at", null),
  ]);
  if (!trip) notFound();

  const total = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);

  // foreign currencies seen on this trip: implied market rate + agreed rate
  const fxMap = new Map((fxRates ?? []).map((r) => [r.currency as string, Number(r.agreed_rate)]));
  const currencyAgg = new Map<string, { orig: number; aud: number }>();
  for (const e of expenses ?? []) {
    if (e.original_currency && e.original_amount) {
      const cur = currencyAgg.get(e.original_currency) ?? { orig: 0, aud: 0 };
      cur.orig += Number(e.original_amount);
      cur.aud += Number(e.amount);
      currencyAgg.set(e.original_currency, cur);
    }
  }
  const photoCount = (album?.photos as unknown as { count: number }[])?.[0]?.count ?? 0;
  const inviteFor = new Map(
    (invites ?? [])
      .filter((i) => new Date(i.expires_at) > new Date())
      .map((i) => [i.participant_id, i.token])
  );
  // household members with emails, minus those already on the trip (for the picker)
  const { data: memberEmails } = canEdit
    ? await supabase.rpc("household_member_emails", { hid: membership.household_id })
    : { data: [] };
  const onTrip = new Set((participants ?? []).map((p) => p.user_id).filter(Boolean));
  const pickerOptions = ((memberEmails ?? []) as { user_id: string; email: string; display_name: string }[])
    .filter((m) => !onTrip.has(m.user_id));

  const byFamily = new Map<string, NonNullable<typeof participants>>();
  const unassigned: NonNullable<typeof participants> = [];
  for (const p of participants ?? []) {
    if (p.family_id) byFamily.set(p.family_id, [...(byFamily.get(p.family_id) ?? []), p]);
    else unassigned.push(p);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/holidays" className="text-xs text-stone-400 hover:underline">← Trips</Link>
          <h1 className="text-2xl font-semibold">{trip.name}</h1>
          <p className="text-sm text-stone-500">
            {trip.destination ?? ""}
            {trip.start_date &&
              ` · ${new Date(trip.start_date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`}
            {trip.end_date &&
              ` – ${new Date(trip.end_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`}
            <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs capitalize">{trip.status}</span>
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <form action={setTripStatus}>
              <input type="hidden" name="trip_id" value={trip.id} />
              <input type="hidden" name="status" value={trip.status === "completed" ? "active" : "completed"} />
              <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100">
                {trip.status === "completed" ? "Reopen" : "Mark completed"}
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

      <TripTabs tripId={trip.id} />
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href={`/holidays/${trip.id}/expenses`} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="text-2xl">💸</div>
          <div className="mt-2 font-medium">Split the bill</div>
          <div className="mt-1 text-sm text-stone-500">
            {(expenses ?? []).length} expense{(expenses ?? []).length === 1 ? "" : "s"} ·{" "}
            <span className="font-medium text-stone-700">{formatMoney(total, currency)}</span> total
          </div>
        </Link>
        <Link href={`/holidays/${trip.id}/photos`} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="text-2xl">📷</div>
          <div className="mt-2 font-medium">Trip photos</div>
          <div className="mt-1 text-sm text-stone-500">
            {photoCount} photo{photoCount === 1 ? "" : "s"} — also in the Photo Album
          </div>
        </Link>
      </div>

      {currencyAgg.size > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Exchange rates</h2>
          <p className="mt-1 text-xs text-stone-400">
            Market = live rate at scan time. Set an agreed rate (what you actually got
            changing money) and balances use it — everyone sees all three numbers.
          </p>
          <div className="mt-3 space-y-2">
            {[...currencyAgg.entries()].map(([cur, agg]) => {
              const marketRate = agg.orig > 0 ? agg.aud / agg.orig : 0;
              return (
                <form key={cur} action={setAgreedRate} className="flex flex-wrap items-center gap-3 text-sm">
                  <input type="hidden" name="trip_id" value={trip.id} />
                  <input type="hidden" name="currency" value={cur} />
                  <span className="w-12 font-mono font-semibold">{cur}</span>
                  <span className="text-stone-500">
                    market ≈ <span className="font-medium text-stone-700">{marketRate.toFixed(4)}</span>
                  </span>
                  {canEdit ? (
                    <>
                      <label className="flex items-center gap-1.5">
                        <span className="text-stone-500">agreed</span>
                        <input
                          name="agreed_rate"
                          type="number"
                          step="0.000001"
                          min="0"
                          defaultValue={fxMap.get(cur) ?? ""}
                          placeholder={marketRate.toFixed(4)}
                          className="w-28 rounded-lg border border-stone-300 px-2 py-1 text-sm"
                        />
                      </label>
                      <button className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-100">
                        Save
                      </button>
                    </>
                  ) : (
                    <span className="text-stone-500">
                      agreed:{" "}
                      <span className="font-medium text-stone-700">
                        {fxMap.get(cur)?.toFixed(4) ?? "—"}
                      </span>
                    </span>
                  )}
                </form>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Families on this trip</h2>
        </div>

        {(families ?? []).map((f) => {
          const members = byFamily.get(f.id) ?? [];
          return (
            <div key={f.id} className="rounded-xl border border-stone-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{f.name}</h3>
                {canEdit && members.length === 0 && (
                  <form action={removeTripFamily}>
                    <input type="hidden" name="trip_id" value={trip.id} />
                    <input type="hidden" name="family_id" value={f.id} />
                    <button className="text-xs text-stone-300 hover:text-red-600">remove family</button>
                  </form>
                )}
              </div>
              <ul className="mt-3 space-y-1.5">
                {members.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5">
                      {p.name}
                      {p.is_manager && <span title="Manager">⭐</span>}
                      {p.email && <span className="text-xs text-stone-400">{p.email}</span>}
                      {p.user_id ? (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">has access</span>
                      ) : (
                        <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-400">no access yet</span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      {canEdit && !p.user_id && (
                        inviteFor.get(p.id) ? (
                          <CopyButton path={`/trip-invite/${inviteFor.get(p.id)}`} label="Copy invite link" />
                        ) : (
                          <form action={createTripInvite}>
                            <input type="hidden" name="trip_id" value={trip.id} />
                            <input type="hidden" name="participant_id" value={p.id} />
                            <button className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-100">
                              Invite
                            </button>
                          </form>
                        )
                      )}
                      {canEdit && (
                        <form action={removeParticipant}>
                          <input type="hidden" name="participant_id" value={p.id} />
                          <input type="hidden" name="trip_id" value={trip.id} />
                          <button className="text-xs text-stone-300 hover:text-red-600">remove</button>
                        </form>
                      )}
                    </span>
                  </li>
                ))}
                {members.length === 0 && (
                  <li className="text-sm text-stone-400">No members yet.</li>
                )}
              </ul>
              {canEdit && (
                <AddFamilyMember
                  tripId={trip.id}
                  familyId={f.id}
                  householdOptions={
                    f.linked_household_id === membership.household_id ? pickerOptions : []
                  }
                />
              )}
            </div>
          );
        })}

        {unassigned.length > 0 && (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white p-5">
            <h3 className="text-sm font-medium text-stone-500">Not in a family yet</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {unassigned.map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span>{p.name}</span>
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
          </div>
        )}

        {canEdit && (
          <form action={addTripFamily} className="flex items-end gap-2 rounded-xl border border-stone-200 bg-white p-5">
            <input type="hidden" name="trip_id" value={trip.id} />
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium">Add another family</label>
              <input name="name" required placeholder="e.g. Family Schmidt" className={inputCls} />
            </div>
            <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
              Add family
            </button>
          </form>
        )}
        <p className="text-xs text-stone-400">
          ⭐ managers keep the family record. Members with an email get an invite link —
          once they claim it, they see this trip only.
        </p>
      </div>
    </div>
  );
}
