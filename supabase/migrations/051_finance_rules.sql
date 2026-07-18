-- Family Hub: 051_finance_rules
--
-- The rule book (Xero-style): user-written bank rules. "When the description
-- (or merchant) contains X, allocate category Y." Rules run when transactions
-- arrive (feed webhook + CSV import) and BEAT the learned payee default —
-- an explicit rule is the user's word. The allocation always lands as
-- to-confirm (reviewed = false) or as a suggestion, never silently final.
-- Retro-application to already-arrived unsorted rows happens app-side when a
-- rule is created or edited (suggestion_source = 'rule').

create table finance_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  match_text text not null,
  match_field text not null default 'any'
    check (match_field in ('any', 'description', 'merchant')),
  category_id uuid not null references finance_categories (id) on delete cascade,
  enabled boolean not null default true,
  sort_order int not null default 0, -- first matching rule wins (lower first, then oldest)
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index finance_rules_household on finance_rules (household_id);

alter table finance_rules enable row level security;
create policy "finance view" on finance_rules for select using (finance_access(household_id) in ('view','edit'));
create policy "finance edit ins" on finance_rules for insert with check (finance_access(household_id) = 'edit');
create policy "finance edit upd" on finance_rules for update using (finance_access(household_id) = 'edit');
create policy "finance edit del" on finance_rules for delete using (finance_access(household_id) = 'edit');

-- 'rule' joins the allowed suggestion provenances
alter table finance_transactions drop constraint finance_transactions_suggestion_source_check;
alter table finance_transactions add constraint finance_transactions_suggestion_source_check
  check (suggestion_source in ('payee', 'bank', 'ai', 'rule'));
