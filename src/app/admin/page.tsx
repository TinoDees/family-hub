import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminOverviewPage() {
  const supabase = createAdminClient();

  const [householdsRes, tripsRes, usersRes, newestRes] = await Promise.all([
    supabase.from("households").select("*", { count: "exact", head: true }),
    supabase.from("trips").select("*", { count: "exact", head: true }),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase
      .from("households")
      .select("id, name, created_at, household_members(count)")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const users = usersRes.data?.users ?? [];
  const newest = (newestRes.data ?? []) as unknown as {
    id: string;
    name: string;
    created_at: string;
    household_members: { count: number }[];
  }[];

  // Signups per week, last 8 weeks (weeks start Monday).
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(weekStart);
    start.setDate(start.getDate() - (7 - i) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const count = users.filter((u) => {
      const t = new Date(u.created_at).getTime();
      return t >= start.getTime() && t < end.getTime();
    }).length;
    return { start, count };
  });
  const maxWeek = Math.max(1, ...weeks.map((w) => w.count));

  const stats = [
    { label: "Households", value: householdsRes.count ?? 0 },
    { label: "Users", value: users.length },
    { label: "Trips", value: tripsRes.count ?? 0 },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Platform overview</h1>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-stone-200 bg-white p-5"
          >
            <div className="text-sm text-stone-500">{s.label}</div>
            <div className="mt-1 text-3xl font-semibold text-teal-700">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Signups per week (last 8 weeks)</h2>
          <ul className="mt-4 space-y-2">
            {weeks.map((w) => (
              <li key={w.start.toISOString()} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs text-stone-500">
                  {w.start.toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
                <span className="h-4 flex-1 rounded bg-stone-100">
                  <span
                    className="block h-4 rounded bg-teal-600"
                    style={{ width: `${(w.count / maxWeek) * 100}%` }}
                  />
                </span>
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-stone-700">
                  {w.count}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Newest households</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                <th className="py-1.5 pr-2 font-medium">Name</th>
                <th className="py-1.5 pr-2 font-medium">Members</th>
                <th className="py-1.5 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {newest.map((h) => (
                <tr key={h.id} className="border-b border-stone-100 last:border-0">
                  <td className="py-1.5 pr-2">
                    <Link
                      href={`/admin/households/${h.id}`}
                      className="font-medium text-teal-700 hover:underline"
                    >
                      {h.name}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {h.household_members?.[0]?.count ?? 0}
                  </td>
                  <td className="py-1.5 text-stone-500">{fmtDate(h.created_at)}</td>
                </tr>
              ))}
              {newest.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-3 text-stone-500">
                    No households yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
