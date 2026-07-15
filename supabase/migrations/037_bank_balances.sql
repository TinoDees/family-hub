-- 037: live bank balances via Redbark REST API
alter table finance_accounts add column if not exists bank_balance numeric;
alter table finance_accounts add column if not exists bank_available numeric;
alter table finance_accounts add column if not exists balance_synced_at timestamptz;
alter table redbark_feeds add column if not exists api_key text;
