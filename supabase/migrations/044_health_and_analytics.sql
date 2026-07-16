-- 044: platform health — first-party funnel analytics, security events, daily health reports.
-- All three tables are service-role only (RLS on, no policies): written via
-- route handlers / server actions with the admin client, read on /admin/health.

create table analytics_events (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  session_id text,
  event text not null, -- page_view | signup_started | signup_completed | login
  path text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device text,   -- mobile | desktop
  ip_hash text   -- salted sha256, never the raw IP
);
create index analytics_events_ts on analytics_events (ts desc);
create index analytics_events_event_ts on analytics_events (event, ts desc);
alter table analytics_events enable row level security;

create table security_events (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  kind text not null, -- login_failed | signup_failed | webhook_bad_signature | account_deleted | cron_unauthorised
  identifier text,    -- salted hash of the email/subject, never plaintext
  ip_hash text,
  path text,
  detail text
);
create index security_events_ts on security_events (ts desc);
create index security_events_kind_ts on security_events (kind, ts desc);
alter table security_events enable row level security;

create table health_reports (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  status text not null default 'ok', -- ok | warn | alert
  report jsonb not null,
  emailed boolean not null default false
);
create index health_reports_run_at on health_reports (run_at desc);
alter table health_reports enable row level security;

-- Redbark liveness: stamped by the webhook route on every verified delivery.
alter table redbark_feeds add column if not exists last_received_at timestamptz;
