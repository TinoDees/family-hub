import { createAdminClient } from "@/lib/supabase/admin";
import type { HealthReport } from "@/lib/health";
import { runHealthCheckNow } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  ok: "bg-teal-50 text-teal-700 border-teal-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  alert: "bg-red-50 text-red-700 border-red-200",
  skip: "bg-stone-100 text-stone-500 border-stone-200",
};

const STATUS_DOT: Record<string, string> = {
  ok: "bg-teal-500",
  warn: "bg-amber-500",
  alert: "bg-red-500",
  skip: "bg-stone-300",
};

function fmt(d: string) {
  return new Date(d).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="text-2xl font-semibold text-stone-900">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wide text-stone-500">
        {label}
      </div>
      {sub && <div className="mt-0.5 text-xs text-stone-400">{sub}</div>}
    </div>
  );
}

export default async function AdminHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = createAdminClient();
  const { data: rows } = await supabase
    .from("health_reports")
    .select("id, run_at, status, emailed, report")
    .order("run_at", { ascending: false })
    .limit(14);

  const latest = rows?.[0];
  const report = latest?.report as HealthReport | undefined;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Platform health</h1>
          <p className="text-sm text-stone-500">
            Daily automated check — signups, funnel, attack watch and service status.
          </p>
        </div>
        <form action={runHealthCheckNow}>
          <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
            Run check now
          </button>
        </form>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {!report ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
          No health reports yet. The cron runs daily at 7am Sydney — or press
          “Run check now” for the first one.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${STATUS_STYLE[report.status]}`}
            >
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[report.status]}`} />
              {report.status.toUpperCase()}
            </span>
            <span className="text-sm text-stone-500">
              Last run {fmt(report.run_at)} ({report.trigger})
              {latest?.emailed ? " · emailed" : ""}
            </span>
          </div>

          {/* Growth */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
              Growth — last 24h
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="New signups" value={report.growth.new_users_24h} sub={`${report.growth.new_users_7d} this week`} />
              <Stat label="New households" value={report.growth.new_households_24h} />
              <Stat label="Opt-outs (deletions)" value={report.growth.account_deletions_24h} />
              <Stat label="Total users" value={report.growth.total_users} />
            </div>
          </section>

          {/* Funnel */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
              Signup funnel — last 24h
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="Landing visitors" value={report.funnel.landing_visitors_24h} sub={`${report.funnel.landing_views_24h} views`} />
              <Stat label="Pricing views" value={report.funnel.pricing_views_24h} />
              <Stat label="Reached signup" value={report.funnel.signup_page_views_24h} />
              <Stat label="Completed" value={report.funnel.signups_completed_24h} />
              <Stat
                label="Didn't proceed"
                value={report.funnel.bounced_visitors_24h}
                sub={
                  report.funnel.visit_to_signup_pct === null
                    ? undefined
                    : `${report.funnel.visit_to_signup_pct}% converted`
                }
              />
            </div>
          </section>

          {/* Security */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
              Attack watch — last 24h
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Failed logins"
                value={report.security.failed_logins_24h}
                sub={`avg ${report.security.failed_logins_daily_avg_7d}/day`}
              />
              <Stat label="Failed signups" value={report.security.failed_signups_24h} />
              <Stat label="Bad webhook sigs" value={report.security.bad_webhook_signatures_24h} />
              <Stat label="Cron probes" value={report.security.cron_unauthorised_24h} />
            </div>
            {report.security.notes.length > 0 && (
              <ul className="mt-3 space-y-1 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {report.security.notes.map((n) => (
                  <li key={n}>⚠ {n}</li>
                ))}
              </ul>
            )}
          </section>

          {/* Services */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
              Services
            </h2>
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              {report.checks.map((c) => (
                <div
                  key={c.name}
                  className="flex items-start gap-3 border-b border-stone-100 px-4 py-3 last:border-0"
                >
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[c.status]}`} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-stone-900">{c.name}</div>
                    <div className="text-sm text-stone-600">{c.summary}</div>
                    {c.detail && <div className="text-xs text-stone-400">{c.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* History */}
      {rows && rows.length > 1 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
            History
          </h2>
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-2">Run</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Signups</th>
                  <th className="px-4 py-2">Visitors</th>
                  <th className="px-4 py-2">Failed logins</th>
                  <th className="px-4 py-2">Emailed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rep = r.report as HealthReport;
                  return (
                    <tr key={r.id} className="border-t border-stone-100">
                      <td className="px-4 py-2">{fmt(r.run_at)}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-2">{rep?.growth?.new_users_24h ?? "—"}</td>
                      <td className="px-4 py-2">{rep?.funnel?.landing_visitors_24h ?? "—"}</td>
                      <td className="px-4 py-2">{rep?.security?.failed_logins_24h ?? "—"}</td>
                      <td className="px-4 py-2">{r.emailed ? "✓" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
