import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";
import { getPermissions, accessFor, canAtLeast } from "@/lib/permissions";
import {
  expandOccurrences,
  colorFor,
  fmtTime,
  type PlannerEvent,
  type Occurrence,
} from "@/lib/planner";
import { formatMoney } from "@/lib/finance";

const TYPE_ICON: Record<string, string> = {
  bank: "🏦",
  savings: "🌱",
  cash: "💵",
  credit: "💳",
  other: "📁",
};

const SLOT_META: Record<string, { label: string; icon: string }> = {
  breakfast: { label: "Breakfast", icon: "🥐" },
  lunch: { label: "Lunch", icon: "🥪" },
  snack: { label: "Snack", icon: "🍎" },
};

/** YYYY-MM-DD for a moment, in the household's timezone. */
function isoInTz(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Whole days from one ISO date to another (positive = future). */
function dayDiff(fromIso: string, toIso: string) {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000
  );
}

function fmtTripDates(start: string | null, end: string | null) {
  if (!start) return "";
  const f = (s: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${s}T00:00:00`).toLocaleDateString("en-AU", opts);
  if (!end || end === start) return f(start, { day: "numeric", month: "short", year: "numeric" });
  return `${f(start, { day: "numeric", month: "short" })} – ${f(end, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

type Member = { id: string; name: string; color: string };
type MealEntry = {
  slot: string;
  custom_text: string | null;
  servings: number | null;
  recipe: { name: string } | null;
};
type Trip = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
};
type AccountCard = {
  id: string;
  name: string;
  type: string;
  balance: number;
  live: boolean;
  available: number | null;
};

export default async function DashboardPage() {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const perms = await getPermissions(membership.household_id, user!.id, membership.role);
  const can = (slug: string) => canAtLeast(accessFor(perms, slug), "view");

  const hid = membership.household_id;
  const tz = membership.household.timezone ?? "Australia/Sydney";
  const currency = membership.household.base_currency;
  const now = new Date();
  const todayIso = isoInTz(now, tz);
  const tomorrowIso = isoInTz(new Date(now.getTime() + 86400000), tz);
  const hour = Number(
    new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now)
  );
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const todayLabel = new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

  // ---- data loaders, each gated by module access ------------------------

  const loadPlanner = async (): Promise<{ members: Member[]; occurrences: Occurrence[] }> => {
    const [{ data: members }, { data: events }] = await Promise.all([
      supabase
        .from("household_members")
        .select("user_id, display_name")
        .eq("household_id", hid)
        .order("joined_at"),
      supabase
        .from("planner_events")
        .select(
          "id, title, event_date, start_time, end_time, location, assigned, recurrence, recurrence_until"
        )
        .eq("household_id", hid)
        .or(
          `and(event_date.gte.${todayIso},event_date.lte.${tomorrowIso}),recurrence.not.is.null`
        ),
    ]);
    const memberList = (members ?? []).map((m, i) => ({
      id: m.user_id as string,
      name: (m.display_name as string | null) ?? "Member",
      color: colorFor(i),
    }));
    const occurrences = expandOccurrences(
      (events ?? []) as PlannerEvent[],
      new Date(`${todayIso}T00:00:00`),
      new Date(`${tomorrowIso}T00:00:00`)
    );
    return { members: memberList, occurrences };
  };

  const loadMeals = async (): Promise<MealEntry[]> => {
    const { data } = await supabase
      .from("meal_plan_entries")
      .select("slot, custom_text, servings, recipe:recipes!meal_plan_entries_recipe_id_fkey(name)")
      .eq("household_id", hid)
      .eq("entry_date", todayIso);
    return (data ?? []) as unknown as MealEntry[];
  };

  const loadNextTrip = async (): Promise<Trip | null> => {
    const { data } = await supabase
      .from("trips")
      .select("id, name, destination, start_date, end_date, status")
      .eq("household_id", hid)
      .neq("status", "completed")
      .not("start_date", "is", null)
      .order("start_date");
    const trips = (data ?? []) as Trip[];
    const current = trips.find(
      (t) => t.start_date! <= todayIso && (t.end_date ?? t.start_date!) >= todayIso
    );
    if (current) return current;
    return trips.find((t) => t.start_date! > todayIso) ?? null;
  };

  const loadShoppingCount = async (): Promise<number> => {
    const { count } = await supabase
      .from("shopping_list_items")
      .select("id, shopping_lists!inner(status)", { count: "exact", head: true })
      .eq("household_id", hid)
      .eq("checked", false)
      .eq("shopping_lists.status", "open");
    return count ?? 0;
  };

  /** Stored balances only — no refresh here; the finance page keeps them fresh. */
  const loadMoney = async (): Promise<{ accounts: AccountCard[]; total: number } | null> => {
    const [{ data: accounts }, { data: sums }] = await Promise.all([
      supabase
        .from("finance_accounts")
        .select("id, name, type, opening_balance, bank_balance, bank_available")
        .eq("household_id", hid)
        .order("type")
        .order("name"),
      supabase
        .from("finance_transactions")
        .select("account_id, amount")
        .eq("household_id", hid)
        .not("account_id", "is", null),
    ]);
    if (!accounts || accounts.length === 0) return null;
    const txnSum = new Map<string, number>();
    for (const t of sums ?? [])
      txnSum.set(t.account_id!, (txnSum.get(t.account_id!) ?? 0) + Number(t.amount));
    const cards: AccountCard[] = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance:
        a.bank_balance !== null && a.bank_balance !== undefined
          ? Number(a.bank_balance)
          : Number(a.opening_balance) + (txnSum.get(a.id) ?? 0),
      live: a.bank_balance !== null && a.bank_balance !== undefined,
      available:
        a.bank_available !== null && a.bank_available !== undefined
          ? Number(a.bank_available)
          : null,
    }));
    return { accounts: cards, total: cards.reduce((s, a) => s + a.balance, 0) };
  };

  const loadGuestTrips = async () => {
    const { data } = await supabase
      .from("trip_participants")
      .select("trip_id, trips!inner(id, name, household_id)")
      .eq("user_id", user!.id)
      .neq("trips.household_id", hid);
    return (data ?? [])
      .map((g) => g.trips as unknown as { id: string; name: string })
      .filter(Boolean);
  };

  const [planner, meals, nextTrip, shoppingCount, money, guestTrips] = await Promise.all([
    can("planner") ? loadPlanner() : Promise.resolve(null),
    can("meals") ? loadMeals() : Promise.resolve(null),
    can("holidays") ? loadNextTrip() : Promise.resolve(null),
    can("shopping") ? loadShoppingCount() : Promise.resolve(0),
    can("finance") ? loadMoney() : Promise.resolve(null),
    loadGuestTrips(),
  ]);

  const memberById = new Map((planner?.members ?? []).map((m) => [m.id, m]));
  const eventsFor = (dateIso: string) =>
    (planner?.occurrences ?? []).filter((o) => o.occurs_on === dateIso);

  const dinner = (meals ?? []).find((m) => m.slot === "dinner");
  const otherMeals = (meals ?? []).filter((m) => m.slot !== "dinner");
  const mealName = (m: MealEntry) => m.recipe?.name ?? m.custom_text ?? "";

  const tripIsRunning =
    nextTrip !== null &&
    nextTrip.start_date! <= todayIso &&
    (nextTrip.end_date ?? nextTrip.start_date!) >= todayIso;

  // ---- small render helpers ---------------------------------------------

  const WhoDots = ({ ids }: { ids: string[] }) => {
    const people =
      ids.length > 0
        ? ids.map((id) => memberById.get(id)).filter((p): p is Member => Boolean(p))
        : null;
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-stone-500">
        {people ? (
          <>
            <span className="flex shrink-0 gap-0.5">
              {people.slice(0, 4).map((p) => (
                <span
                  key={p.id}
                  className="h-2 w-2 rounded-full"
                  style={{ background: p.color }}
                />
              ))}
            </span>
            <span className="truncate">{people.map((p) => p.name).join(", ")}</span>
          </>
        ) : (
          <span>Everyone</span>
        )}
      </span>
    );
  };

  const DayCard = ({ title, dateIso }: { title: string; dateIso: string }) => {
    const events = eventsFor(dateIso);
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">📆 {title}</h2>
          <Link href="/planner" className="text-sm text-stone-500 underline">
            Planner
          </Link>
        </div>
        {events.length === 0 ? (
          <p className="py-4 text-sm text-stone-400">
            Nothing planned —{" "}
            <Link href="/planner" className="underline">
              add to the Family Planner
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-2.5">
            {events.map((o, i) => (
              <li key={`${o.id}-${i}`} className="flex items-start gap-3 text-sm">
                <span className="w-16 shrink-0 pt-0.5 text-xs font-medium tabular-nums text-stone-400">
                  {o.start_time ? fmtTime(o.start_time) : "All day"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {o.title}
                    {o.isRecurring && <span title="repeats weekly"> 🔁</span>}
                  </span>
                  {o.location && (
                    <span className="block text-xs text-stone-400">📍 {o.location}</span>
                  )}
                  <WhoDots ids={o.assigned} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm text-stone-500">
          {todayLabel} · {membership.household.name}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">
          {greeting}, {membership.display_name ?? "there"} 👋
        </h1>
        {membership.role === "owner" && (planner?.members.length ?? 2) < 2 && (
          <p className="mt-1 text-sm text-stone-500">
            Invite your family from{" "}
            <Link href="/settings/invites" className="underline">
              Settings → Invites
            </Link>
            .
          </p>
        )}
      </div>

      {/* Trips this user is invited to (other households) */}
      {guestTrips.length > 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
          <h2 className="text-sm font-semibold text-sky-900">🧳 Trips you&apos;re invited to</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {guestTrips.map((t) => (
              <Link
                key={t.id}
                href={`/guest/${t.id}`}
                className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium shadow-sm hover:shadow"
              >
                ✈️ {t.name} →
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Today / Tomorrow */}
      {planner && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <DayCard title="Today" dateIso={todayIso} />
          <DayCard title="Tomorrow" dateIso={tomorrowIso} />
        </div>
      )}

      {/* Meals + next trip */}
      {(meals !== null || nextTrip) && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {meals !== null && (
            <div className="rounded-xl border border-stone-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">🍽️ On the menu today</h2>
                <Link href="/meals" className="text-sm text-stone-500 underline">
                  Meal Planner
                </Link>
              </div>
              {meals.length === 0 ? (
                <p className="py-4 text-sm text-stone-400">
                  Nothing on the menu yet —{" "}
                  <Link href="/meals" className="underline">
                    plan today&apos;s meals
                  </Link>
                  .
                </p>
              ) : (
                <div className="space-y-3">
                  {dinner && (
                    <div className="rounded-lg bg-teal-50 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-teal-700">
                        Tonight
                      </div>
                      <div className="mt-0.5 text-lg font-semibold text-teal-900">
                        🍝 {mealName(dinner)}
                        {dinner.servings ? (
                          <span className="ml-2 text-sm font-normal text-teal-700">
                            serves {dinner.servings}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}
                  {otherMeals.length > 0 && (
                    <ul className="space-y-1.5">
                      {otherMeals.map((m, i) => (
                        <li key={i} className="flex items-baseline gap-2 text-sm">
                          <span className="w-24 shrink-0 text-stone-400">
                            {SLOT_META[m.slot]?.icon ?? "🍽️"}{" "}
                            {SLOT_META[m.slot]?.label ?? m.slot}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {mealName(m)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {nextTrip && (
            <Link
              href={`/holidays/${nextTrip.id}`}
              className="block rounded-xl border border-stone-200 bg-white p-5 transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">✈️ {tripIsRunning ? "Your trip" : "Next trip"}</h2>
                <span className="text-sm text-stone-500 underline">Open</span>
              </div>
              <div className="text-lg font-semibold">{nextTrip.name}</div>
              {nextTrip.destination && (
                <div className="text-sm text-stone-500">📍 {nextTrip.destination}</div>
              )}
              <div className="mt-1 text-sm text-stone-500">
                {fmtTripDates(nextTrip.start_date, nextTrip.end_date)}
              </div>
              <div className="mt-2 inline-block rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-800">
                {tripIsRunning
                  ? `Day ${dayDiff(nextTrip.start_date!, todayIso) + 1} of your trip 🎉`
                  : dayDiff(todayIso, nextTrip.start_date!) === 1
                    ? "Tomorrow!"
                    : `In ${dayDiff(todayIso, nextTrip.start_date!)} days`}
              </div>
            </Link>
          )}
        </div>
      )}

      {/* Money — same dark strip as the finance dashboard (stored balances only) */}
      {money && (
        <div className="rounded-2xl bg-stone-900 p-5 text-white">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-stone-400">
                All accounts together
              </div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">
                {formatMoney(money.total, currency)}
              </div>
            </div>
            <Link
              href="/finance"
              className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-stone-200 hover:bg-white/10"
            >
              Open Finance →
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {money.accounts.map((a) => (
              <div key={a.id} className="rounded-xl bg-white/10 p-4">
                <div className="flex items-center gap-2 text-sm text-stone-300">
                  <span>{TYPE_ICON[a.type] ?? "📁"}</span>
                  <span className="truncate">{a.name}</span>
                  {a.live && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> live
                    </span>
                  )}
                </div>
                <div
                  className={`mt-1 text-xl font-semibold tabular-nums ${
                    a.balance < 0 ? "text-red-300" : ""
                  }`}
                >
                  {formatMoney(a.balance, currency)}
                </div>
                {a.available !== null && (
                  <div className="text-xs text-stone-400">
                    {formatMoney(a.available, currency)} available
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shopping glance */}
      {shoppingCount > 0 && (
        <Link
          href="/shopping"
          className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-4 text-sm transition-shadow hover:shadow-md"
        >
          <span>
            🛒 <span className="font-medium">{shoppingCount}</span>{" "}
            {shoppingCount === 1 ? "thing" : "things"} on the shopping list
          </span>
          <span className="font-medium text-stone-500">Open lists →</span>
        </Link>
      )}
    </div>
  );
}
