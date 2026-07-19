"use client";

import { useRouter } from "next/navigation";

/**
 * The Plan page's date-range header — big and unmissable. Presets for the
 * common cases, custom from/to for families who plan further ahead but only
 * shop for a certain stretch.
 */

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
function addDays(isoDate: string, days: number): Date {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d;
}

const fmt = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

export function PlanRange({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const go = (f: string, t: string) => router.push(`/shopping/plan?from=${f}&to=${t}`);

  const thisMonday = iso(mondayOf(new Date()));
  const nextMonday = iso(addDays(thisMonday, 7));

  const presets = [
    { label: "This week", f: thisMonday, t: iso(addDays(thisMonday, 6)) },
    { label: "Next week", f: nextMonday, t: iso(addDays(nextMonday, 6)) },
    { label: "Next 14 days", f: iso(new Date()), t: iso(addDays(iso(new Date()), 13)) },
  ];

  const dateInput =
    "rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-teal-500 focus:outline-none";

  return (
    <div className="rounded-xl border border-stone-200 bg-white px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
            🛒 Planning the shop for
          </p>
          <p className="text-xl font-semibold">
            {fmt(from)} <span className="text-stone-300">→</span> {fmt(to)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((p) => {
            const active = p.f === from && p.t === to;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => go(p.f, p.t)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  active
                    ? "border-teal-700 bg-teal-700 text-white"
                    : "border-stone-300 text-stone-600 hover:bg-stone-100"
                }`}
              >
                {p.label}
              </button>
            );
          })}
          <div className="flex items-center gap-1.5 text-xs text-stone-400">
            <input
              type="date"
              value={from}
              onChange={(e) => e.target.value && go(e.target.value, to >= e.target.value ? to : e.target.value)}
              className={dateInput}
              title="From"
            />
            →
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => e.target.value && go(from, e.target.value)}
              className={dateInput}
              title="To"
            />
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-stone-400">
        Meals planned in this date range set the ingredients — notes and low staples are
        always included.
      </p>
    </div>
  );
}
