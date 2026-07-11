-- Family Hub: 002_finance
-- Feed-ready ledger: accounts, categories, transactions, budgets.
-- Transactions carry external_id + import_hash so a live bank feed (Basiq et al)
-- can plug in later without schema change. Amounts are SIGNED (negative = spend).

create type account_type as enum ('bank', 'credit', 'savings', 'cash', 'other');
create type category_kind as enum ('expense', 'income');
create type txn_source as enum ('manual', 'import', 'feed');

create table finance_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  type account_type not null default 'bank',
  institution text,
  currency text not null default 'AUD',
  created_at timestamptz not null default now()
);

create table finance_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  icon text,
  kind category_kind not null default 'expense',
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create table finance_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  account_id uuid references finance_accounts (id) on delete cascade,
  posted_at date not null,
  description text not null,
  merchant text,
  amount numeric(14, 2) not null,
  currency text not null default 'AUD',
  category_id uuid references finance_categories (id) on delete set null,
  notes text,
  source txn_source not null default 'manual',
  external_id text,
  import_hash text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (household_id, import_hash)
);

create index finance_transactions_household_date
  on finance_transactions (household_id, posted_at desc);

create table finance_budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  category_id uuid not null references finance_categories (id) on delete cascade,
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  unique (household_id, category_id)
);

-- Module-aware access: override row wins, else role default (owner/adult edit, child none).
-- Mirrors src/lib/modules.ts finance defaults — keep in sync if those change.
create or replace function finance_access(hid uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select access::text from module_permissions
      where household_id = hid and user_id = auth.uid() and module_slug = 'finance'),
    case
      when (select role from household_members
             where household_id = hid and user_id = auth.uid()) in ('owner', 'adult')
      then 'edit' else 'none'
    end
  );
$$;

alter table finance_accounts enable row level security;
alter table finance_categories enable row level security;
alter table finance_transactions enable row level security;
alter table finance_budgets enable row level security;

create policy "finance view" on finance_accounts for select using (finance_access(household_id) in ('view','edit'));
create policy "finance edit ins" on finance_accounts for insert with check (finance_access(household_id) = 'edit');
create policy "finance edit upd" on finance_accounts for update using (finance_access(household_id) = 'edit');
create policy "finance edit del" on finance_accounts for delete using (finance_access(household_id) = 'edit');

create policy "finance view" on finance_categories for select using (finance_access(household_id) in ('view','edit'));
create policy "finance edit ins" on finance_categories for insert with check (finance_access(household_id) = 'edit');
create policy "finance edit upd" on finance_categories for update using (finance_access(household_id) = 'edit');
create policy "finance edit del" on finance_categories for delete using (finance_access(household_id) = 'edit');

create policy "finance view" on finance_transactions for select using (finance_access(household_id) in ('view','edit'));
create policy "finance edit ins" on finance_transactions for insert with check (finance_access(household_id) = 'edit');
create policy "finance edit upd" on finance_transactions for update using (finance_access(household_id) = 'edit');
create policy "finance edit del" on finance_transactions for delete using (finance_access(household_id) = 'edit');

create policy "finance view" on finance_budgets for select using (finance_access(household_id) in ('view','edit'));
create policy "finance edit ins" on finance_budgets for insert with check (finance_access(household_id) = 'edit');
create policy "finance edit upd" on finance_budgets for update using (finance_access(household_id) = 'edit');
create policy "finance edit del" on finance_budgets for delete using (finance_access(household_id) = 'edit');

-- Sensible starter categories, idempotent.
create or replace function seed_default_categories(p_household uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if finance_access(p_household) <> 'edit' then
    raise exception 'No finance edit access';
  end if;
  insert into finance_categories (household_id, name, icon, kind)
  values
    (p_household, 'Groceries', '🛒', 'expense'),
    (p_household, 'Dining out', '🍽️', 'expense'),
    (p_household, 'Transport', '🚗', 'expense'),
    (p_household, 'Fuel', '⛽', 'expense'),
    (p_household, 'Utilities', '💡', 'expense'),
    (p_household, 'Housing', '🏠', 'expense'),
    (p_household, 'Insurance', '🛡️', 'expense'),
    (p_household, 'Health', '🏥', 'expense'),
    (p_household, 'Kids & school', '🎒', 'expense'),
    (p_household, 'Entertainment', '🎬', 'expense'),
    (p_household, 'Clothing', '👕', 'expense'),
    (p_household, 'Subscriptions', '📺', 'expense'),
    (p_household, 'Gifts', '🎁', 'expense'),
    (p_household, 'Holidays', '✈️', 'expense'),
    (p_household, 'Other', '🧾', 'expense'),
    (p_household, 'Salary', '💼', 'income'),
    (p_household, 'Interest', '🏦', 'income'),
    (p_household, 'Other income', '💰', 'income')
  on conflict (household_id, name) do nothing;
end;
$$;

revoke execute on function seed_default_categories(uuid) from anon;
