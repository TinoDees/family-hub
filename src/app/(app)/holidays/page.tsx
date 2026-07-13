import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { formatMoney } from "@/lib/finance";
import { createTrip } from "@/lib/actions/trips";
import { inputCls, buttonCls } from "@/components/auth-card";

const STATUS_STYLE: Record<string, string> = {
  planning: "bg-sky-100 text-sky-700",
  active: "bg-emerald-100 text-emerald-700",
  completed: "bg-stone-100 text-stone-500",
};

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { membership, access } = await requireModule("holidays", "view");
  const { error } = await searchParams;
  const currency = membership.household.base_currency;

  const supabase = await createClient();
  const [{ data: trips }, { data: totals }, { data: albums }] = await Promise.all([
    supabase
      .from("trips")
      .select("id, name, destination, start_date, end_date, status")
      .eq("household_id", membership.household_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("trip_expenses")
      .select("trip_id, amount")
      .eq("household_id", membership.household_id),
    supabase
      .from("albums")
      .select("trip_id, hero:photos!albums_hero_photo_id_fkey(storage_path)")
      .eq("household_id", membership.household_id)
      .not("trip_id", "is", null),
  ]);

  const heroPathByTrip = new Map<string, string>();
  for (const a of albums ?? []) {
    const path = (a.hero as unknown as { storage_path: string } | null)?.storage_path;
    if (a.trip_id && path) heroPathByTrip.set(a.trip_id, path);
  }
  const heroPaths = [...heroPathByTrip.values()];
  const { data: signedHeroes } = heroPaths.length
    ? await supabase.storage.from("photos").createSignedUrls(heroPaths, 3600)
    : { data: [] };
  const heroUrlByPath = new Map((signedHeroes ?? []).map((s) => [s.path, s.signedUrl]));
  const totalFor = new Map<string, number>();
  for (const t of totals ?? []) {
    totalFor.set(t.trip_id, (totalFor.get(t.trip_id) ?? 0) + Number(t.amount));
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">✈️ Holiday Planner</h1>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {access === "edit" && (
        <form action={createTrip} className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-5">
          <div className="min-w-48 flex-1">
            <label className="mb-1 block text-sm font-medium">Trip name</label>
            <input name="name" required placeholder="e.g. Gold Coast with the Schmidts" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Destination</label>
            <input name="destination" placeholder="Gold Coast, QLD" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">From</label>
            <input name="start_date" type="date" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">To</label>
            <input name="end_date" type="date" className={inputCls} />
          </div>
          <button className={`${buttonCls} w-auto px-6`}>Create trip</button>
        </form>
      )}

      {(trips ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-400">
          No trips yet — plan the next family holiday!
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(trips ?? []).map((t) => (
            (() => {
              const heroPath = heroPathByTrip.get(t.id);
              const heroUrl = heroPath ? heroUrlByPath.get(heroPath) : null;
              return (
            <Link
              key={t.id}
              href={`/holidays/${t.id}`}
              className="relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              {heroUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={heroUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
              <div className={heroUrl ? "relative bg-gradient-to-t from-black/75 via-black/30 to-black/10 p-5 text-white" : "p-5"}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium">{t.name}</div>
                <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_STYLE[t.status]}`}>
                  {t.status}
                </span>
              </div>
              <div className={`mt-1 text-sm ${heroUrl ? "text-white/80" : "text-stone-500"}`}>
                {t.destination ?? "—"}
                {t.start_date && (
                  <>
                    {" · "}
                    {new Date(t.start_date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                    {t.end_date &&
                      ` – ${new Date(t.end_date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`}
                  </>
                )}
              </div>
              <div className={`mt-3 text-sm ${heroUrl ? "text-white/90" : "text-stone-600"}`}>
                Spent so far:{" "}
                <span className="font-medium">{formatMoney(totalFor.get(t.id) ?? 0, currency)}</span>
              </div>
              </div>
            </Link>
              );
            })()
          ))}
        </div>
      )}
    </div>
  );
}
