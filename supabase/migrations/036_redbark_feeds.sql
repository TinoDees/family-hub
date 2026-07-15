-- 036: Redbark webhook feeds — one row per household feed, secret verified per delivery.
-- Service-role only (no policies): the webhook route reads via admin client.
create table redbark_feeds (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  webhook_secret text not null unique,
  label text,
  created_at timestamptz not null default now()
);
alter table redbark_feeds enable row level security;

alter table finance_accounts add column if not exists external_id text;
create unique index if not exists finance_accounts_external
  on finance_accounts (household_id, external_id) where external_id is not null;
