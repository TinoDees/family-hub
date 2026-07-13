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
} from "@/lib/actions/trips";
import { CopyButton } from "@/components/copy-button";
import { TripTabs } from "@/components/trip-tabs";
import { ConfirmSubmit } from "@/components/confirm-submit";
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
  const [{ data: trip }, { data: participants }, { data: expenses }, { data: album }, { data: invites }] =
    await Promise.all([
      supabase
        .from("trips")
        .select("id, name, destination, start_date, end_date, status")
        .eq("id", id)
        .eq("household_id", membership.household_id)
        .maybeSingle(),
      supabase.from("trip_participants").select("id, name, user_id").eq("trip_id", id).order("created_at"),
      supabase.from("trip_expenses").select("id, amount").eq("trip_id", id),
      supabase.from("albums").select("id, photos(count)").eq("trip_id", id).maybeSingle(),
      supabase
        .from("trip_invites")
        .select("participant_id, token, expires_at")
        .eq("trip_id", id)
        .is("accepted_at", null)
        .is("revoked_at", null),
    ]);
  if (!trip) notFound();

  const total = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const inviteFor = new Map(
    (invites ?? [])
      .filter((i) => new Date(i.expires_at) > new Date())
      .map((i) => [i.participant_id, i.token])
  );
  const photoCount = (album?.photos as unknown as { count: number }[])?.[0]?.count ?? 0;

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
                confirmMessage={`Delete "${trip.name}" including all its expenses and unlink its album?`}
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

      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold">Who&apos;s on the trip</h2>
        <ul className="mt-3 space-y-1.5">
          {(participants ?? []).map((p) => (
            <li key={p.id} className="flex items-center justify-between text-sm">
              <span>
                {p.name}
                {p.user_id ? (
                  <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">
                    has access
                  </span>
                ) : (
                  <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-400">
                    no account
                  </span>
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
                        Invite as guest
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
        </ul>
        {canEdit && (
          <form action={addParticipant} className="mt-3 flex gap-2">
            <input type="hidden" name="trip_id" value={trip.id} />
            <input name="name" required placeholder="e.g. Michael Schmidt" className={`${inputCls} flex-1`} />
            <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-100">Add</button>
          </form>
        )}
        <p className="mt-3 text-xs text-stone-400">
          &ldquo;Invite as guest&rdquo; creates a link your friend opens to set a password —
          they then see only this trip, and within it only their own expenses.
        </p>
      </div>
    </div>
  );
}
