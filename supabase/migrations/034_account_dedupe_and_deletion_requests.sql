-- 034: no duplicate account names per household + deletion-request workflow
create unique index if not exists finance_accounts_household_name
  on finance_accounts (household_id, lower(name));

alter table finance_accounts add column if not exists deletion_requested_by uuid references auth.users (id);
alter table finance_accounts add column if not exists deletion_requested_at timestamptz;
