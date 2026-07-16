-- Family Hub: 047_split_finances (Phase 1)
-- For families WITHOUT a joint bank account: each partner keeps their own
-- accounts and chips in for household costs. Two building blocks:
--
--   1. Account ownership & privacy — an account can belong to one member
--      (owner_user_id; null = joint / whole-family) and be 'private', in
--      which case ONLY its owner can see it (and its transactions). The
--      default stays 'shared' so nothing changes for existing families.
--
--   2. Transaction scope — every transaction is 'household' (counts in the
--      family's budgets, month stats, reviews and goal maths) or 'personal'
--      (the member's own spending — excluded from household reporting, but
--      still part of the account's balance). Payees remember the last choice
--      (default_scope) so future feed/CSV rows land right automatically.
--
-- Phase 2 (contributions + household pot screen) builds on exactly these
-- flags: "personal account + household-scoped spend" is a contribution
-- candidate. Nothing here needs to change for it.

-- ---- columns ---------------------------------------------------------------

alter table finance_accounts
  add column owner_user_id uuid references auth.users (id), -- null = joint/family account
  add column visibility text not null default 'shared'
    check (visibility in ('shared', 'private'));

alter table finance_transactions
  add column scope text not null default 'household'
    check (scope in ('household', 'personal'));

alter table finance_payees
  add column default_scope text
    check (default_scope in ('household', 'personal'));

-- personal rows are the rare ones — a partial index keeps the filter cheap
create index finance_transactions_personal
  on finance_transactions (household_id, scope)
  where scope = 'personal';

-- ---- RLS: private accounts are invisible to everyone except their owner ----
--
-- The outer condition stays finance_access(household_id) — the module gate
-- (owner/adult edit by default, per-user overrides win). The new inner
-- condition adds privacy:
--
--   accounts:      visible/updatable/deletable when visibility = 'shared'
--                  OR the viewer IS the owner (owner_user_id = auth.uid()).
--   transactions:  follow their account via EXISTS — if you can't see the
--                  account, you can't see (or touch) its transactions.
--                  Transactions with account_id NULL stay visible to the
--                  whole household (manual entries with no account).
--
-- The app refuses to set visibility = 'private' while owner_user_id is null
-- (that combination would hide the account from everyone, owner included).
-- INSERT policies are unchanged: the feed webhook uses the service role and
-- members inserting manual transactions pick from accounts they can see.

drop policy "finance view" on finance_accounts;
create policy "finance view" on finance_accounts for select using (
  finance_access(household_id) in ('view', 'edit')
  and (visibility = 'shared' or owner_user_id = auth.uid())
);

drop policy "finance edit upd" on finance_accounts;
create policy "finance edit upd" on finance_accounts for update using (
  finance_access(household_id) = 'edit'
  and (visibility = 'shared' or owner_user_id = auth.uid())
);

drop policy "finance edit del" on finance_accounts;
create policy "finance edit del" on finance_accounts for delete using (
  finance_access(household_id) = 'edit'
  and (visibility = 'shared' or owner_user_id = auth.uid())
);

drop policy "finance view" on finance_transactions;
create policy "finance view" on finance_transactions for select using (
  finance_access(household_id) in ('view', 'edit')
  and (
    account_id is null
    or exists (
      select 1 from finance_accounts a
      where a.id = finance_transactions.account_id
        and (a.visibility = 'shared' or a.owner_user_id = auth.uid())
    )
  )
);

drop policy "finance edit upd" on finance_transactions;
create policy "finance edit upd" on finance_transactions for update using (
  finance_access(household_id) = 'edit'
  and (
    account_id is null
    or exists (
      select 1 from finance_accounts a
      where a.id = finance_transactions.account_id
        and (a.visibility = 'shared' or a.owner_user_id = auth.uid())
    )
  )
);

drop policy "finance edit del" on finance_transactions;
create policy "finance edit del" on finance_transactions for delete using (
  finance_access(household_id) = 'edit'
  and (
    account_id is null
    or exists (
      select 1 from finance_accounts a
      where a.id = finance_transactions.account_id
        and (a.visibility = 'shared' or a.owner_user_id = auth.uid())
    )
  )
);
