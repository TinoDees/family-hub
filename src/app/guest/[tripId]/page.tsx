import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/finance";
import { signOut } from "@/lib/actions/auth";
import { AddExpenseForm } from "@/components/add-expense-form";
import { PhotoUploader } from "@/components/photo-uploader";
import { ChatClient } from "@/components/chat-client";
import { colorFor } from "@/lib/planner";
import { createGuestTripAlbum } from "@/lib/actions/guest-trip";

export const dynamic = "force-dynamic";

export default async function GuestTripPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tripId } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: trip }, { data: participants }, { data: album }] = await Promise.all([
    supabase
      .from("trips")
      .select("id, name, destination, start_date, end_date, status, household_id")
      .eq("id", tripId)
      .maybeSingle(),
    supabase.from("trip_participants").select("id, name, user_id").eq("trip_id", tripId).order("created_at"),
    supabase.from("albums").select("id, name").eq("trip_id", tripId).maybeSingle(),
  ]);
  if (!trip) redirect("/");
  const me = (participants ?? []).find((p) => p.user_id === user.id);
  if (!me) redirect("/");

  // RLS already limits expenses to ones I paid or share in
  const { data: expenses } = await supabase
    .from("trip_expenses")
    .select("id, description, amount, spent_at, paid_by, receipt_photo_id, original_amount, original_currency")
    .eq("trip_id", tripId)
    .order("spent_at", { ascending: false });

  const expenseIds = (expenses ?? []).map((e) => e.id);
  const { data: shares } = expenseIds.length
    ? await supabase
        .from("trip_expense_shares")
        .select("expense_id, participant_id, amount")
        .in("expense_id", expenseIds)
    : { data: [] as { expense_id: string; participant_id: string; amount: number }[] };

  const pName = new Map((participants ?? []).map((p) => [p.id, p.name]));

  // same agreed-rate adjustment the hosts see
  const { data: fxRates } = await supabase
    .from("trip_fx_rates")
    .select("currency, agreed_rate")
    .eq("trip_id", tripId);
  const agreedRate = new Map((fxRates ?? []).map((r) => [r.currency as string, Number(r.agreed_rate)]));
  const expenseFactor = new Map(
    (expenses ?? []).map((e) => {
      if (!e.original_currency || !e.original_amount || Number(e.amount) === 0) return [e.id, 1];
      const agreed = agreedRate.get(e.original_currency);
      return [e.id, agreed ? (Number(e.original_amount) * agreed) / Number(e.amount) : 1];
    })
  );

  const myPaid = (expenses ?? [])
    .filter((e) => e.paid_by === me.id)
    .reduce((s, e) => s + Number(e.amount) * (expenseFactor.get(e.id) ?? 1), 0);
  const myShare = (shares ?? [])
    .filter((s) => s.participant_id === me.id)
    .reduce((sum, s) => sum + Number(s.amount) * (expenseFactor.get(s.expense_id) ?? 1), 0);
  const net = Math.round((myPaid - myShare) * 100) / 100;

  const { data: chatMessages } = await supabase
    .from("chat_messages")
    .select("id, sender, body, created_at")
    .eq("channel_kind", "trip")
    .eq("channel_id", tripId)
    .order("created_at")
    .limit(200);
  const chatNames: Record<string, string> = {};
  const chatColors: Record<string, string> = {};
  (participants ?? []).forEach((p, i) => {
    if (p.user_id) {
      chatNames[p.user_id] = p.name;
      chatColors[p.user_id] = colorFor(i);
    }
  });

  const { data: photos } = album
    ? await supabase
        .from("photos")
        .select("id, storage_path, caption")
        .eq("album_id", album.id)
        .order("created_at", { ascending: false })
        .limit(60)
    : { data: [] };
  const signedPhotos = (photos ?? []).length
    ? (
        await supabase.storage
          .from("photos")
          .createSignedUrls((photos ?? []).map((p) => p.storage_path), 3600)
      ).data
    : [];
  const photoUrl = new Map((signedPhotos ?? []).map((s) => [s.path, s.signedUrl]));

  const sharesByExpense = new Map<string, string[]>();
  for (const s of shares ?? []) {
    sharesByExpense.set(s.expense_id, [
      ...(sharesByExpense.get(s.expense_id) ?? []),
      pName.get(s.participant_id) ?? "?",
    ]);
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nestly-icon-192.png" alt="Nestly" className="h-8 w-8 rounded-lg" />
          <div>
            <div className="text-sm font-semibold leading-tight">Nestly</div>
            <div className="text-xs text-stone-500">Trip guest</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-stone-500">{me.name}</span>
          <form action={signOut}>
            <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-100">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold">✈️ {trip.name}</h1>
          <p className="text-sm text-stone-500">
            {trip.destination ?? ""}
            {trip.start_date &&
              ` · ${new Date(trip.start_date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`}
            {trip.end_date &&
              ` – ${new Date(trip.end_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`}
          </p>
          <p className="mt-1 text-xs text-stone-400">
            You see your own expenses and anything split with you — nothing else.
          </p>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-stone-400">You paid</div>
            <div className="mt-1 text-lg font-semibold">{formatMoney(myPaid)}</div>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Your share</div>
            <div className="mt-1 text-lg font-semibold">{formatMoney(myShare)}</div>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Balance</div>
            <div className={`mt-1 text-lg font-semibold ${net > 0.004 ? "text-emerald-600" : net < -0.004 ? "text-red-600" : ""}`}>
              {net > 0.004 ? "+" : ""}{formatMoney(net)}
            </div>
          </div>
        </div>

        {trip.status !== "completed" && (
          <AddExpenseForm
            tripId={trip.id}
            participants={(participants ?? []).map((p) => ({ id: p.id, name: p.name }))}
            guestParticipantId={me.id}
          />
        )}

        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <div className="border-b border-stone-100 px-4 py-2.5">
            <h2 className="text-sm font-semibold">Your expenses</h2>
          </div>
          {(expenses ?? []).length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-stone-400">
              Nothing yet — add what you pay for and it splits automatically.
            </p>
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
                        {e.paid_by === me.id ? "You" : pName.get(e.paid_by)} paid · split{" "}
                        {(sharesByExpense.get(e.id) ?? []).join(", ")}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-medium">
                      {formatMoney(Number(e.amount) * (expenseFactor.get(e.id) ?? 1))}
                      {e.original_amount && e.original_currency && (
                        <div className="text-[10px] font-normal text-stone-400">
                          {e.original_currency} {Number(e.original_amount).toLocaleString()}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">💬 Trip chat</h2>
          <ChatClient
            channelKind="trip"
            channelId={trip.id}
            initialMessages={chatMessages ?? []}
            meId={user.id}
            names={chatNames}
            colors={chatColors}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">📷 Trip photos</h2>
          </div>
          {!album ? (
            <form action={createGuestTripAlbum} className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center">
              <input type="hidden" name="trip_id" value={trip.id} />
              <p className="text-sm text-stone-500">No trip album yet.</p>
              <button className="mt-3 rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700">
                Create trip album
              </button>
            </form>
          ) : (
            <>
              <PhotoUploader householdId={trip.household_id} albumId={album.id} />
              {(photos ?? []).filter((p) => p.caption !== "Receipt").length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {(photos ?? []).filter((p) => p.caption !== "Receipt").map((p) => {
                    const url = photoUrl.get(p.storage_path);
                    return (
                      <div key={p.id} className="overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
                        {url ? (
                          <a href={url} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={p.caption ?? ""} className="aspect-square w-full object-cover" loading="lazy" />
                          </a>
                        ) : (
                          <div className="flex aspect-square items-center justify-center text-stone-300">📷</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
