-- Family Hub: 041_goals_and_reviews
-- Savings goals (family targets with progress) and monthly finance reviews
-- (AI-written markdown stored per household+month, with honest stats jsonb).
-- Both reuse the finance_access() RLS helper from 002_finance.

create table finance_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  icon text,
  target_amount numeric(14, 2) not null,
  saved_amount numeric(14, 2) not null default 0,
  target_date date,
  notes text,
  achieved_at timestamptz,
  created_at timestamptz not null default now()
);

create index finance_goals_household on finance_goals (household_id, created_at);

alter table finance_goals enable row level security;
create policy "finance view" on finance_goals for select using (finance_access(household_id) in ('view','edit'));
create policy "finance edit ins" on finance_goals for insert with check (finance_access(household_id) = 'edit');
create policy "finance edit upd" on finance_goals for update using (finance_access(household_id) = 'edit');
create policy "finance edit del" on finance_goals for delete using (finance_access(household_id) = 'edit');

create table finance_reviews (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  month_key text not null, -- e.g. '2026-07'
  content text not null, -- markdown, written by Claude
  potential_savings numeric(12, 2),
  stats jsonb, -- the aggregates the review was written from (honest numbers)
  created_at timestamptz not null default now(),
  unique (household_id, month_key)
);

alter table finance_reviews enable row level security;
create policy "finance view" on finance_reviews for select using (finance_access(household_id) in ('view','edit'));
create policy "finance edit ins" on finance_reviews for insert with check (finance_access(household_id) = 'edit');
create policy "finance edit upd" on finance_reviews for update using (finance_access(household_id) = 'edit');
create policy "finance edit del" on finance_reviews for delete using (finance_access(household_id) = 'edit');
