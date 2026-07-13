export const MEMBER_COLORS = [
  "#0284c7", // sky
  "#dc2626", // red
  "#16a34a", // green
  "#9333ea", // purple
  "#ea580c", // orange
  "#0d9488", // teal
  "#db2777", // pink
  "#ca8a04", // yellow
];

export function colorFor(index: number) {
  return MEMBER_COLORS[index % MEMBER_COLORS.length];
}

export type PlannerEvent = {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  assigned: string[];
  recurrence: string | null;
  recurrence_until: string | null;
};

export type Occurrence = PlannerEvent & { occurs_on: string; isRecurring: boolean };

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Expand base events + weekly recurrences into concrete dates within [start, end]. */
export function expandOccurrences(events: PlannerEvent[], start: Date, end: Date): Occurrence[] {
  const out: Occurrence[] = [];
  const startIso = iso(start);
  const endIso = iso(end);
  for (const e of events) {
    if (!e.recurrence) {
      if (e.event_date >= startIso && e.event_date <= endIso) {
        out.push({ ...e, occurs_on: e.event_date, isRecurring: false });
      }
      continue;
    }
    // weekly: same weekday as event_date, from event_date to recurrence_until
    const first = new Date(`${e.event_date}T00:00:00`);
    const until = e.recurrence_until ? new Date(`${e.recurrence_until}T00:00:00`) : null;
    const cursor = new Date(start);
    // align cursor to the event's weekday
    const delta = (first.getDay() - cursor.getDay() + 7) % 7;
    cursor.setDate(cursor.getDate() + delta);
    while (cursor <= end) {
      if (cursor >= first && (!until || cursor <= until)) {
        out.push({ ...e, occurs_on: iso(cursor), isRecurring: true });
      }
      cursor.setDate(cursor.getDate() + 7);
    }
  }
  return out.sort((a, b) =>
    a.occurs_on === b.occurs_on
      ? (a.start_time ?? "99").localeCompare(b.start_time ?? "99")
      : a.occurs_on.localeCompare(b.occurs_on)
  );
}

export function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hh}:${String(m).padStart(2, "0")}${ampm}` : `${hh}${ampm}`;
}
