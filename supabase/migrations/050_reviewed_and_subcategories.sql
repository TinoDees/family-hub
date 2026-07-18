-- Family Hub: 050_reviewed_and_subcategories
--
-- 1. Confirmation tick for categorisations. A transaction's category can arrive
--    two ways: a PERSON picked it (grid, modal, accepting a suggestion) or a
--    RULE applied it (payee memory / bank category at import, feed webhook).
--    `reviewed` records that a person has confirmed the category. The "To sort"
--    inbox = no category yet OR categorised-by-rule awaiting its tick; "Sorted"
--    = confirmed. Manual picks set reviewed = true at write time; rule-applied
--    rows stay false until the user ticks them (confirm actions in
--    src/lib/actions/finance.ts).
--
-- 2. Sub-categories. finance_categories.parent_id nests one level deep
--    (Groceries > Butcher). The app enforces single-level nesting (a parent
--    cannot itself have a parent); sort_order is reserved for future manual
--    ordering. Deleting a parent promotes its children to root (set null).

alter table finance_transactions
  add column reviewed boolean not null default false;

-- Backfill: categorised with no suggestion provenance = a person did it.
-- Rows whose category came from a rule (suggestion_source set) await a tick.
update finance_transactions
  set reviewed = true
  where category_id is not null and suggestion_source is null;

-- cheap lookup for the To sort inbox (unreviewed rows are the rare ones over time)
create index finance_transactions_unreviewed
  on finance_transactions (household_id, account_id)
  where reviewed = false;

alter table finance_categories
  add column parent_id uuid references finance_categories (id) on delete set null,
  add column sort_order int not null default 0;

create index finance_categories_parent on finance_categories (parent_id);
