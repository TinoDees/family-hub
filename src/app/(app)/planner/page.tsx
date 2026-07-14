import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/module-guard";
import { addEvent, deleteEvent } from "@/lib/actions/planner";
import { expandOccurrences, colorFor, fmtTime, type PlannerEvent } from "@/lib/planner";
import { inputCls } from "@/components/auth-card";

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function mondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; d?: string; error?: string; mine?: string }>;
}) {
  const { membership, access, userId } = await requireModule("planner", "view");
  const { view = "week", d, error, mine } = await searchParams;
  const canEdit = access === "edit";
  const anchor = d ? new Date(`${d}T00:00:00`) : new Date();

  const supabase = await createClient();
  const { data: members } = await supabase
    .from("household_members")
    .select("user_id, display_name, role")
    .eq("household_id", membership.household_id)
    .order("joined_at");
  const memberList = (members ?? []).map((m, i) => ({
    id: m.user_id,
    name: m.display_name ?? "Member",
    color: colorFor(i),
  }));
  const memberById = new Map(memberList.map((m) => [m.id, m]));

  // range per view
  let rangeStart: Date, rangeEnd: Date;
  if (view === "month") {
    rangeStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    rangeEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  } else if (view === "list") {
    rangeStart = new Date();
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 60);
  } else {
    rangeStart = mondayOf(anchor);
    rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeStart.getDate() + 6);
  }

  const [{ data: events }, { data: meals }] = await Promise.all([
    supabase
      .from("planner_events")
      .select("id, title, event_date, start_time, end_time, location, assigned, recurrence, recurrence_until")
      .eq("household_id", membership.household_id)
      .or(`and(event_date.gte.${iso(rangeStart)},event_date.lte.${iso(rangeEnd)}),recurrence.not.is.null`),
    view === "week"
      ? supabase
          .from("meal_plan_entries")
          .select("id, entry_date, slot, custom_text, servings, recipe:recipes!meal_plan_entries_recipe_id_fkey(name)")
          .eq("household_id", membership.household_id)
          .gte("entry_date", iso(rangeStart))
          .lte("entry_date", iso(rangeEnd))
      : Promise.resolve({ data: [] }),
  ]);

  const mineOnly = mine === "1" || (membership.role === "child" && mine !== "0");
  let occurrences = expandOccurrences((events ?? []) as PlannerEvent[], rangeStart, rangeEnd);
  if (mineOnly) {
    occurrences = occurrences.filter((o) => o.assigned.length === 0 || o.assigned.includes(userId));
  }

  const byDate = new Map<string, typeof occurrences>();
  for (const o of occurrences) byDate.set(o.occurs_on, [...(byDate.get(o.occurs_on) ?? []), o]);
  const mealsByDate = new Map<string, NonNullable<typeof meals>>();
  for (const m of meals ?? []) mealsByDate.set(m.entry_date, [...(mealsByDate.get(m.entry_date) ?? []), m]);

  const days = view === "week"
    ? Array.from({ length: 7 }, (_, i) => {
        const day = new Date(rangeStart);
        day.setDate(rangeStart.getDate() + i);
        return day;
      })
    : [];
  const todayIso = iso(new Date());

  const shift = (delta: number) => {
    const nd = new Date(anchor);
    if (view === "month") nd.setMonth(nd.getMonth() + delta);
    else nd.setDate(nd.getDate() + delta * 7);
    return iso(nd);
  };

  const EventChip = ({ o }: { o: (typeof occurrences)[number] }) => (
    <div className="group flex items-start gap-1.5 rounded-lg bg-stone-50 px-1.5 py-1 text-xs">
      <span className="mt-1 flex shrink-0 gap-0.5">
        {(o.assigned.length > 0 ? o.assigned : memberList.map((m) => m.id)).slice(0, 4).map((uid) => (
          <span key={uid} className="h-2 w-2 rounded-full" style={{ background: memberById.get(uid)?.color ?? "#a8a29e" }} />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-medium">{o.title}</span>
        {o.isRecurring && <span title="repeats weekly"> 🔁</span>}
        <span className="block text-[10px] text-stone-400">
          {fmtTime(o.start_time)}
          {o.end_time && `–${fmtTime(o.end_time)}`}
          {o.location && ` · ${o.location}`}
        </span>
      </span>
      {canEdit && (
        <form action={deleteEvent} className="opacity-0 group-hover:opacity-100">
          <input type="hidden" name="event_id" value={o.id} />
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="d" value={iso(anchor)} />
          <button className="text-stone-300 hover:text-red-600" title={o.isRecurring ? "Delete series" : "Delete"}>✕</button>
        </form>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">📆 Family Planner</h1>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-stone-300 text-sm">
            {(["week", "month", "list"] as const).map((v) => (
              <Link
                key={v}
                href={`/planner?view=${v}&d=${iso(anchor)}${mineOnly ? "&mine=1" : ""}`}
                className={`px-3 py-1.5 capitalize ${view === v ? "bg-stone-900 text-white" : "hover:bg-stone-100"}`}
              >
                {v}
              </Link>
            ))}
          </div>
          {view !== "list" && (
            <>
              <Link href={`/planner?view=${view}&d=${shift(-1)}`} className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100">←</Link>
              <Link href={`/planner?view=${view}`} className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100">Today</Link>
              <Link href={`/planner?view=${view}&d=${shift(1)}`} className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100">→</Link>
            </>
          )}
          <Link
            href={`/planner?view=${view}&d=${iso(anchor)}${mineOnly ? "" : "&mine=1"}`}
            className={`rounded-lg border px-3 py-1.5 text-sm ${mineOnly ? "border-sky-400 bg-sky-50 text-sky-700" : "border-stone-300 hover:bg-stone-100"}`}
          >
            {mineOnly ? "My week ✓" : "My week"}
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        {memberList.map((m) => (
          <span key={m.id} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
            {m.name}
          </span>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {canEdit && (
        <details className="rounded-xl border border-stone-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-stone-600">+ Add event</summary>
          <form action={addEvent} className="space-y-3 border-t border-stone-100 p-4">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="d" value={iso(anchor)} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <div className="col-span-2 sm:col-span-3">
                <label className="mb-1 block text-xs font-medium">Title</label>
                <input name="title" required placeholder="e.g. Soccer training" className={inputCls} />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className="mb-1 block text-xs font-medium">Date</label>
                <input name="event_date" type="date" required defaultValue={todayIso} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">From</label>
                <input name="start_time" type="time" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">To</label>
                <input name="end_time" type="time" className={inputCls} />
              </div>
              <div className="col-span-2 sm:col-span-4">
                <label className="mb-1 block text-xs font-medium">Location</label>
                <input name="location" placeholder="optional" className={inputCls} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-wrap gap-3">
                <span className="text-xs font-medium">Who:</span>
                {memberList.map((m) => (
                  <label key={m.id} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="assigned" value={m.id} className="rounded border-stone-300" />
                    <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                    {m.name}
                  </label>
                ))}
                <span className="text-xs text-stone-400">(none ticked = whole family)</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="recurring" className="rounded border-stone-300" /> repeats weekly
              </label>
              <label className="flex items-center gap-1.5 text-xs text-stone-500">
                until <input name="recurrence_until" type="date" className="rounded-lg border border-stone-300 px-2 py-1 text-sm" />
              </label>
              <button className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700">Add</button>
            </div>
          </form>
        </details>
      )}

      {view === "week" && (
        <div className="space-y-2 md:hidden">
          {days.map((day) => {
            const key = iso(day);
            const dayMeals = mealsByDate.get(key) ?? [];
            const dayEvents = byDate.get(key) ?? [];
            return (
              <div key={key} className={`rounded-xl border bg-white ${key === todayIso ? "border-amber-300" : "border-stone-200"}`}>
                <div className={`border-b border-stone-100 px-3 py-2 text-sm font-semibold ${key === todayIso ? "text-amber-700" : "text-stone-600"}`}>
                  {day.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" })}
                  {key === todayIso && " · today"}
                </div>
                <div className="space-y-1 p-2">
                  {dayMeals.map((m) => (
                    <Link key={m.id} href="/meals" className="block truncate rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                      🍽 {(m.recipe as unknown as { name: string } | null)?.name ?? m.custom_text}
                    </Link>
                  ))}
                  {dayEvents.length === 0 && dayMeals.length === 0 && (
                    <p className="px-2 py-1 text-xs text-stone-300">—</p>
                  )}
                  {dayEvents.map((o) => (
                    <EventChip key={`${o.id}-${o.occurs_on}`} o={o} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {view === "week" && (
        <div className="hidden overflow-x-auto rounded-xl border border-stone-200 bg-white md:block">
          <div className="grid min-w-[56rem] grid-cols-7 divide-x divide-stone-100">
            {days.map((day) => {
              const key = iso(day);
              const dayMeals = mealsByDate.get(key) ?? [];
              return (
                <div key={key} className={`min-h-48 ${key === todayIso ? "bg-amber-50/50" : ""}`}>
                  <div className={`border-b border-stone-100 px-2 py-1.5 text-center text-xs font-semibold ${key === todayIso ? "text-amber-700" : "text-stone-500"}`}>
                    {day.toLocaleDateString("en-AU", { weekday: "short", day: "numeric" })}
                  </div>
                  {dayMeals.length > 0 && (
                    <div className="space-y-0.5 border-b border-dashed border-stone-200 p-1.5">
                      {dayMeals.map((m) => (
                        <Link key={m.id} href="/meals" className="block truncate rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-800">
                          🍽 {(m.recipe as unknown as { name: string } | null)?.name ?? m.custom_text}
                        </Link>
                      ))}
                    </div>
                  )}
                  <div className="space-y-1 p-1.5">
                    {(byDate.get(key) ?? []).map((o) => (
                      <EventChip key={`${o.id}-${o.occurs_on}`} o={o} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "month" && (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white p-2">
          <div className="grid min-w-[48rem] grid-cols-7 gap-1">
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((w) => (
              <div key={w} className="px-1 py-1 text-center text-xs font-semibold text-stone-400">{w}</div>
            ))}
            {(() => {
              const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
              const lead = (first.getDay() + 6) % 7;
              const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
              const cells = [];
              for (let i = 0; i < lead; i++) cells.push(<div key={`x${i}`} />);
              for (let dd = 1; dd <= daysInMonth; dd++) {
                const cellDate = new Date(anchor.getFullYear(), anchor.getMonth(), dd);
                const key = iso(cellDate);
                const dayEvents = byDate.get(key) ?? [];
                cells.push(
                  <div key={key} className={`min-h-20 rounded-lg border p-1 ${key === todayIso ? "border-amber-300 bg-amber-50/50" : "border-stone-100"}`}>
                    <div className="text-right text-xs text-stone-400">{dd}</div>
                    {dayEvents.slice(0, 3).map((o) => (
                      <div key={`${o.id}-${o.occurs_on}`} className="mt-0.5 flex items-center gap-1 truncate text-[10px]">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: memberById.get(o.assigned[0] ?? "")?.color ?? "#a8a29e" }} />
                        <span className="truncate">{o.title}</span>
                      </div>
                    ))}
                    {dayEvents.length > 3 && <div className="text-[10px] text-stone-400">+{dayEvents.length - 3} more</div>}
                  </div>
                );
              }
              return cells;
            })()}
          </div>
          <p className="px-2 py-1.5 text-center text-xs text-stone-400">
            {anchor.toLocaleDateString("en-AU", { month: "long", year: "numeric" })} — switch to Week for detail.
          </p>
        </div>
      )}

      {view === "list" && (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          {occurrences.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-stone-400">Nothing coming up in the next 60 days.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {occurrences.map((o) => (
                <li key={`${o.id}-${o.occurs_on}`} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-24 shrink-0 text-xs text-stone-500">
                    {new Date(`${o.occurs_on}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  <span className="flex gap-0.5">
                    {(o.assigned.length > 0 ? o.assigned : memberList.map((m) => m.id)).slice(0, 4).map((uid) => (
                      <span key={uid} className="h-2.5 w-2.5 rounded-full" style={{ background: memberById.get(uid)?.color ?? "#a8a29e" }} />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {o.title}
                    {o.isRecurring && " 🔁"}
                  </span>
                  <span className="text-xs text-stone-400">
                    {fmtTime(o.start_time)}
                    {o.location && ` · ${o.location}`}
                  </span>
                  {canEdit && (
                    <form action={deleteEvent}>
                      <input type="hidden" name="event_id" value={o.id} />
                      <input type="hidden" name="view" value={view} />
                      <input type="hidden" name="d" value={iso(anchor)} />
                      <button className="text-xs text-stone-300 hover:text-red-600">✕</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
