-- 046: pending-transaction support for the Redbark feed.
-- Pending rows are provisional: when the settled version arrives (usually with
-- a NEW bank id), the webhook matches it (account + amount + date window,
-- description similarity as tie-break) and upgrades the pending row IN PLACE —
-- so the ledger never shows the same purchase twice. Pendings that never
-- settle (declined/reversed auths) are auto-expired after 14 days.
alter table finance_transactions
  add column if not exists status text not null default 'posted'
    check (status in ('posted', 'pending'));

-- fast candidate lookup for settlement matching + expiry sweeps
create index if not exists finance_transactions_pending_match
  on finance_transactions (household_id, account_id, amount)
  where status = 'pending';
