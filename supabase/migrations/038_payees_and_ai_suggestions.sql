-- Family Hub: 038_payees_and_ai_suggestions
-- Lightweight payee/merchant entity (Xero-style memory, no chart of accounts):
-- one payee per normalised merchant name per household, with a learned default
-- category. Plus AI suggestion columns on transactions — suggestions are stored
-- separately from category_id and only become the category when a user accepts.

create table finance_payees (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  match_key text not null, -- normalised merchant (see src/lib/payees.ts payeeMatchKey — keep in sync)
  default_category_id uuid references finance_categories (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (household_id, match_key)
);

alter table finance_payees enable row level security;
create policy "finance view" on finance_payees for select using (finance_access(household_id) in ('view','edit'));
create policy "finance edit ins" on finance_payees for insert with check (finance_access(household_id) = 'edit');
create policy "finance edit upd" on finance_payees for update using (finance_access(household_id) = 'edit');
create policy "finance edit del" on finance_payees for delete using (finance_access(household_id) = 'edit');

alter table finance_transactions
  add column payee_id uuid references finance_payees (id) on delete set null,
  add column suggested_category_id uuid references finance_categories (id) on delete set null,
  add column suggestion_source text check (suggestion_source in ('payee', 'bank', 'ai')),
  add column suggestion_confidence numeric(3, 2);

create index finance_transactions_payee on finance_transactions (payee_id);

-- ---- Backfill ------------------------------------------------------------
-- One payee per distinct normalised merchant; normalisation mirrors payeeMatchKey:
-- lowercase → non-letters to spaces → collapse spaces → trim → first 80 chars.

with src as (
  select
    household_id,
    merchant,
    left(btrim(regexp_replace(regexp_replace(lower(merchant), '[^a-z ]', ' ', 'g'), ' +', ' ', 'g')), 80) as match_key
  from finance_transactions
  where merchant is not null
),
distinct_payees as (
  select distinct on (household_id, match_key) household_id, btrim(merchant) as name, match_key
  from src
  where match_key <> ''
  order by household_id, match_key
)
insert into finance_payees (household_id, name, match_key)
select household_id, left(name, 200), match_key from distinct_payees
on conflict (household_id, match_key) do nothing;

update finance_transactions t
set payee_id = p.id
from finance_payees p
where t.merchant is not null
  and p.household_id = t.household_id
  and p.match_key = left(btrim(regexp_replace(regexp_replace(lower(t.merchant), '[^a-z ]', ' ', 'g'), ' +', ' ', 'g')), 80);

-- Seed each payee's default category where the household has been consistent
-- (every categorised transaction of that payee uses the same category).
update finance_payees p
set default_category_id = s.category_id
from (
  select payee_id, min(category_id::text)::uuid as category_id
  from finance_transactions
  where payee_id is not null and category_id is not null
  group by payee_id
  having count(distinct category_id) = 1
) s
where p.id = s.payee_id and p.default_category_id is null;
