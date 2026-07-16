/**
 * Nestly daily health check — the single runner used by both the Vercel cron
 * (/api/cron/daily-health) and the "Run check now" button on /admin/health.
 *
 * Every external check is optional and gated on env config; a missing token
 * yields status "skip" with a hint, never a crash. Individual check failures
 * are caught and reported — one broken API never sinks the whole report.
 *
 * Env (all optional except the core Supabase keys the app already has):
 *   SUPABASE_ACCESS_TOKEN   — Supabase Management API (service health + advisors)
 *   SUPABASE_PROJECT_REF    — project ref (defaults to ref parsed from NEXT_PUBLIC_SUPABASE_URL)
 *   VERCEL_TOKEN            — Vercel API (deployment status)
 *   VERCEL_PROJECT_ID       — Vercel project id or name
 *   VERCEL_TEAM_ID          — optional team scope
 *   GITHUB_TOKEN            — GitHub API (Dependabot alerts)
 *   GITHUB_REPO             — "owner/repo"
 *   RESEND_API_KEY          — already used for transactional email
 *   ADMIN_ALERT_EMAIL       — where the daily report goes
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { sendHealthReportEmail } from "@/lib/email";

export type CheckStatus = "ok" | "warn" | "alert" | "skip";

export type Check = {
  name: string;
  status: CheckStatus;
  summary: string;
  detail?: string;
};

export type HealthReport = {
  run_at: string;
  trigger: "cron" | "manual";
  status: "ok" | "warn" | "alert";
  growth: {
    total_users: number;
    new_users_24h: number;
    new_users_7d: number;
    new_households_24h: number;
    account_deletions_24h: number;
  };
  funnel: {
    landing_visitors_24h: number;
    landing_views_24h: number;
    pricing_views_24h: number;
    signup_page_views_24h: number;
    signups_completed_24h: number;
    bounced_visitors_24h: number; // landed but never reached signup
    visit_to_signup_pct: number | null;
  };
  security: {
    failed_logins_24h: number;
    failed_logins_daily_avg_7d: number;
    failed_signups_24h: number;
    bad_webhook_signatures_24h: number;
    cron_unauthorised_24h: number;
    top_offender_attempts: number; // most failed logins from one IP hash
    notes: string[];
  };
  checks: Check[];
};

const DAY = 24 * 60 * 60 * 1000;

function worst(statuses: CheckStatus[]): "ok" | "warn" | "alert" {
  if (statuses.includes("alert")) return "alert";
  if (statuses.includes("warn")) return "warn";
  return "ok";
}

function projectRef(): string | null {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const m = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

async function safeCheck(name: string, fn: () => Promise<Check>): Promise<Check> {
  try {
    return await fn();
  } catch (e) {
    return {
      name,
      status: "warn",
      summary: "Check failed to run",
      detail: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
    };
  }
}

/* ---------------------------- service checks ---------------------------- */

async function checkSupabase(): Promise<Check> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = projectRef();
  if (!token || !ref)
    return {
      name: "Supabase",
      status: "skip",
      summary: "Set SUPABASE_ACCESS_TOKEN to enable service health + security advisors",
    };
  const headers = { Authorization: `Bearer ${token}` };

  const healthRes = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/health?services=auth,db,storage,realtime`,
    { headers, cache: "no-store" }
  );
  let unhealthy: string[] = [];
  let healthNote = "";
  if (healthRes.ok) {
    const services = (await healthRes.json()) as { name: string; healthy: boolean; status?: string }[];
    unhealthy = services.filter((s) => !s.healthy).map((s) => `${s.name} (${s.status ?? "unhealthy"})`);
  } else {
    healthNote = `health endpoint returned ${healthRes.status}`;
  }

  // Security advisors (lints). Endpoint shape can change — degrade gracefully.
  let advisorNote = "";
  let advisorWarn = 0;
  const advRes = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/advisors/security`,
    { headers, cache: "no-store" }
  );
  if (advRes.ok) {
    const adv = (await advRes.json()) as { lints?: { level?: string; title?: string }[] };
    const lints = adv.lints ?? [];
    const errors = lints.filter((l) => l.level === "ERROR");
    advisorWarn = lints.length;
    if (errors.length > 0)
      advisorNote = `${errors.length} ERROR-level security advisor(s): ${errors
        .slice(0, 3)
        .map((l) => l.title)
        .join("; ")}`;
    else if (lints.length > 0) advisorNote = `${lints.length} security advisor warning(s)`;
  } else {
    advisorNote = `advisors endpoint returned ${advRes.status}`;
  }

  if (unhealthy.length > 0)
    return {
      name: "Supabase",
      status: "alert",
      summary: `Unhealthy services: ${unhealthy.join(", ")}`,
      detail: advisorNote || undefined,
    };
  return {
    name: "Supabase",
    status: advisorWarn > 0 ? "warn" : "ok",
    summary:
      advisorWarn > 0
        ? advisorNote
        : `All services healthy${healthNote ? ` (${healthNote})` : ""}`,
    detail: healthNote && advisorWarn > 0 ? healthNote : undefined,
  };
}

async function checkVercel(): Promise<Check> {
  const token = process.env.VERCEL_TOKEN;
  const project = process.env.VERCEL_PROJECT_ID;
  if (!token || !project)
    return {
      name: "Vercel",
      status: "skip",
      summary: "Set VERCEL_TOKEN + VERCEL_PROJECT_ID to enable deployment checks",
    };
  const team = process.env.VERCEL_TEAM_ID;
  const url = new URL("https://api.vercel.com/v6/deployments");
  url.searchParams.set("projectId", project);
  url.searchParams.set("limit", "10");
  url.searchParams.set("target", "production");
  if (team) url.searchParams.set("teamId", team);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok)
    return { name: "Vercel", status: "warn", summary: `Vercel API returned ${res.status}` };

  const { deployments } = (await res.json()) as {
    deployments: { state: string; created: number; url: string }[];
  };
  if (!deployments?.length)
    return { name: "Vercel", status: "warn", summary: "No production deployments found" };

  const latest = deployments[0];
  const failed24h = deployments.filter(
    (d) => d.state === "ERROR" && Date.now() - d.created < DAY
  ).length;

  if (latest.state === "ERROR")
    return {
      name: "Vercel",
      status: "alert",
      summary: "Latest production deployment FAILED",
      detail: latest.url,
    };
  return {
    name: "Vercel",
    status: failed24h > 0 ? "warn" : "ok",
    summary:
      failed24h > 0
        ? `Latest deploy ${latest.state}, but ${failed24h} failed deploy(s) in last 24h`
        : `Latest production deploy: ${latest.state}`,
  };
}

async function checkResend(): Promise<Check> {
  const key = process.env.RESEND_API_KEY;
  if (!key)
    return { name: "Resend", status: "skip", summary: "RESEND_API_KEY not configured" };

  const res = await fetch("https://api.resend.com/emails?limit=100", {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok)
    return { name: "Resend", status: "warn", summary: `Resend API returned ${res.status}` };

  const json = (await res.json()) as {
    data?: { created_at: string; last_event?: string }[];
  };
  const recent = (json.data ?? []).filter(
    (e) => Date.now() - new Date(e.created_at).getTime() < DAY
  );
  const bad = recent.filter((e) =>
    ["bounced", "failed", "complained"].includes(e.last_event ?? "")
  );
  if (bad.length > 0)
    return {
      name: "Resend",
      status: "warn",
      summary: `${bad.length} of ${recent.length} email(s) in last 24h bounced/failed/complained`,
    };
  return {
    name: "Resend",
    status: "ok",
    summary: `${recent.length} email(s) sent in last 24h, no bounces or complaints`,
  };
}

async function checkGitHub(): Promise<Check> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo)
    return {
      name: "GitHub",
      status: "skip",
      summary: "Set GITHUB_TOKEN + GITHUB_REPO (owner/repo) to enable Dependabot alert checks",
    };
  const res = await fetch(
    `https://api.github.com/repos/${repo}/dependabot/alerts?state=open&per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    }
  );
  if (!res.ok)
    return { name: "GitHub", status: "warn", summary: `GitHub API returned ${res.status}` };

  const alerts = (await res.json()) as {
    security_advisory?: { severity?: string; summary?: string };
  }[];
  const critical = alerts.filter(
    (a) => a.security_advisory?.severity === "critical"
  ).length;
  const high = alerts.filter((a) => a.security_advisory?.severity === "high").length;

  if (critical > 0)
    return {
      name: "GitHub",
      status: "alert",
      summary: `${critical} CRITICAL Dependabot alert(s) open (${alerts.length} total)`,
    };
  if (high > 0)
    return {
      name: "GitHub",
      status: "warn",
      summary: `${high} high-severity Dependabot alert(s) open (${alerts.length} total)`,
    };
  return {
    name: "GitHub",
    status: alerts.length > 0 ? "warn" : "ok",
    summary:
      alerts.length > 0
        ? `${alerts.length} low/medium Dependabot alert(s) open`
        : "No open Dependabot alerts",
  };
}

async function checkRedbark(admin: ReturnType<typeof createAdminClient>): Promise<Check> {
  const { data: feeds } = await admin
    .from("redbark_feeds")
    .select("id, label, last_received_at");
  if (!feeds || feeds.length === 0)
    return { name: "Redbark", status: "skip", summary: "No Redbark feeds configured" };

  const stale = feeds.filter(
    (f) =>
      !f.last_received_at ||
      Date.now() - new Date(f.last_received_at).getTime() > 3 * DAY
  );
  if (stale.length === feeds.length)
    return {
      name: "Redbark",
      status: "warn",
      summary: `No feed has delivered in 3+ days (${feeds.length} feed(s)) — check Redbark webhooks`,
    };
  if (stale.length > 0)
    return {
      name: "Redbark",
      status: "warn",
      summary: `${stale.length} of ${feeds.length} feed(s) silent for 3+ days`,
      detail: stale.map((f) => f.label ?? f.id).join(", "),
    };
  const newest = feeds
    .map((f) => new Date(f.last_received_at!).getTime())
    .sort((a, b) => b - a)[0];
  return {
    name: "Redbark",
    status: "ok",
    summary: `${feeds.length} feed(s) live, last delivery ${Math.round(
      (Date.now() - newest) / 3600000
    )}h ago`,
  };
}

/* ------------------------------ the runner ------------------------------ */

export async function runHealthCheck(
  trigger: "cron" | "manual"
): Promise<{ report: HealthReport; emailed: boolean; emailReason?: string }> {
  const admin = createAdminClient();
  const now = Date.now();
  const since24 = new Date(now - DAY).toISOString();
  const since7d = new Date(now - 7 * DAY).toISOString();

  /* growth */
  const usersRes = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const users = usersRes.data?.users ?? [];
  const newUsers24 = users.filter((u) => u.created_at >= since24).length;
  const newUsers7d = users.filter((u) => u.created_at >= since7d).length;
  const { count: newHouseholds24 } = await admin
    .from("households")
    .select("*", { count: "exact", head: true })
    .gte("created_at", since24);

  /* security events, last 24h + 7d */
  const { data: sec24 } = await admin
    .from("security_events")
    .select("kind, ip_hash")
    .gte("ts", since24);
  const { data: sec7d } = await admin
    .from("security_events")
    .select("kind")
    .gte("ts", since7d);
  const count24 = (kind: string) => (sec24 ?? []).filter((e) => e.kind === kind).length;
  const failedLogins24 = count24("login_failed");
  const failedLogins7d = (sec7d ?? []).filter((e) => e.kind === "login_failed").length;
  const failedLoginAvg = Math.round((failedLogins7d / 7) * 10) / 10;
  const deletions24 = count24("account_deleted");

  // most failed logins from a single (hashed) IP in 24h
  const byIp = new Map<string, number>();
  for (const e of sec24 ?? []) {
    if (e.kind !== "login_failed" || !e.ip_hash) continue;
    byIp.set(e.ip_hash, (byIp.get(e.ip_hash) ?? 0) + 1);
  }
  const topOffender = Math.max(0, ...byIp.values());

  const securityNotes: string[] = [];
  if (failedLogins24 > Math.max(10, failedLoginAvg * 3))
    securityNotes.push(
      `Failed logins spiked: ${failedLogins24} in 24h vs ${failedLoginAvg}/day average — possible credential-stuffing`
    );
  if (topOffender >= 10)
    securityNotes.push(
      `${topOffender} failed logins from a single IP in 24h — possible brute-force`
    );
  if (count24("webhook_bad_signature") > 0)
    securityNotes.push(
      `${count24("webhook_bad_signature")} webhook call(s) with bad signatures — someone probing /api/feeds/redbark`
    );
  if (count24("cron_unauthorised") > 0)
    securityNotes.push(
      `${count24("cron_unauthorised")} unauthorised cron call(s) — someone probing /api/cron endpoints`
    );

  /* funnel */
  const { data: views } = await admin
    .from("analytics_events")
    .select("event, path, session_id")
    .gte("ts", since24);
  const v = views ?? [];
  const landingViews = v.filter((e) => e.event === "page_view" && e.path === "/").length;
  const landingSessions = new Set(
    v.filter((e) => e.event === "page_view" && e.path === "/" && e.session_id).map((e) => e.session_id)
  );
  const signupPageSessions = new Set(
    v.filter((e) => e.event === "page_view" && e.path === "/signup" && e.session_id).map((e) => e.session_id)
  );
  const pricingViews = v.filter((e) => e.event === "page_view" && e.path === "/pricing").length;
  const signupsCompleted = v.filter((e) => e.event === "signup_completed").length;
  const bounced = [...landingSessions].filter((s) => !signupPageSessions.has(s)).length;
  const visitToSignup =
    landingSessions.size > 0
      ? Math.round((signupsCompleted / landingSessions.size) * 1000) / 10
      : null;

  /* service checks (parallel) */
  const checks = await Promise.all([
    safeCheck("Supabase", checkSupabase),
    safeCheck("Vercel", checkVercel),
    safeCheck("Resend", checkResend),
    safeCheck("GitHub", checkGitHub),
    safeCheck("Redbark", () => checkRedbark(admin)),
  ]);

  const securityStatus: CheckStatus =
    securityNotes.length > 0
      ? securityNotes.some((n) => n.includes("spiked") || n.includes("brute-force"))
        ? "alert"
        : "warn"
      : "ok";
  checks.push({
    name: "Attack watch",
    status: securityStatus,
    summary:
      securityNotes.length > 0
        ? securityNotes.join(" · ")
        : `Quiet: ${failedLogins24} failed login(s), no probes detected`,
  });

  const report: HealthReport = {
    run_at: new Date().toISOString(),
    trigger,
    status: worst(checks.map((c) => c.status)),
    growth: {
      total_users: users.length,
      new_users_24h: newUsers24,
      new_users_7d: newUsers7d,
      new_households_24h: newHouseholds24 ?? 0,
      account_deletions_24h: deletions24,
    },
    funnel: {
      landing_visitors_24h: landingSessions.size,
      landing_views_24h: landingViews,
      pricing_views_24h: pricingViews,
      signup_page_views_24h: signupPageSessions.size,
      signups_completed_24h: signupsCompleted,
      bounced_visitors_24h: bounced,
      visit_to_signup_pct: visitToSignup,
    },
    security: {
      failed_logins_24h: failedLogins24,
      failed_logins_daily_avg_7d: failedLoginAvg,
      failed_signups_24h: count24("signup_failed"),
      bad_webhook_signatures_24h: count24("webhook_bad_signature"),
      cron_unauthorised_24h: count24("cron_unauthorised"),
      top_offender_attempts: topOffender,
      notes: securityNotes,
    },
    checks,
  };

  /* email + store */
  const emailResult = await sendHealthReportEmail(report);

  await admin.from("health_reports").insert({
    run_at: report.run_at,
    status: report.status,
    report,
    emailed: emailResult.sent,
  });

  return { report, emailed: emailResult.sent, emailReason: emailResult.reason };
}
