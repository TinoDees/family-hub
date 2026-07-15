-- 035: capture the bank's own category + transaction type on import
alter table finance_transactions add column if not exists bank_category text;
alter table finance_transactions add column if not exists txn_type text;
