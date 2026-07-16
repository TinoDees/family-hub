-- Family Hub: 043_transfers
-- Internal transfers (moving money between your own accounts) must not count
-- as income or spending. Transactions get an is_transfer flag plus a link to
-- the matching leg on the other account. Auto-detected by pairing equal and
-- opposite amounts on different accounts within 3 days (src/lib/transfers.ts),
-- with a manual toggle in the transactions grid for anything missed.
-- Account balances still include transfers; income/spend/reviews/goals exclude them.

alter table finance_transactions
  add column is_transfer boolean not null default false,
  add column transfer_pair_id uuid references finance_transactions (id) on delete set null;

create index finance_transactions_transfer
  on finance_transactions (household_id, is_transfer)
  where is_transfer;
