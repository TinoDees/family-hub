-- Nestly: 053 — the shopping hub (shopping v2 flow rework, 19 Jul 2026).
-- Household-owned grocery categories (seeded from the built-in set, fully
-- editable, one level of sub-categories via parent_id), household retailers,
-- and pantry items pointing at both. shopping_lists.retailer_id ships now so
-- the S2 planning table can split lists per retailer (PO-style) without
-- another migration.

create table retailers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index retailers_household on retailers (household_id, position);

create table grocery_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  emoji text,
  parent_id uuid references grocery_categories (id) on delete cascade,
  builtin_slug text,   -- keeps the auto-guesser working after renames
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index grocery_categories_household on grocery_categories (household_id, position);
-- one seed per household per builtin, and a guard against concurrent seeding
create unique index grocery_categories_builtin
  on grocery_categories (household_id, builtin_slug) where builtin_slug is not null;

alter table pantry_items
  add column category_id uuid references grocery_categories (id) on delete set null,
  add column retailer_id uuid references retailers (id) on delete set null;

alter table shopping_lists
  add column retailer_id uuid references retailers (id) on delete set null;

alter table retailers enable row level security;
alter table grocery_categories enable row level security;

create policy "retailers view" on retailers for select
  using (module_access(household_id, 'shopping', 'edit', 'edit') in ('view', 'edit'));
create policy "retailers write" on retailers for all
  using (module_access(household_id, 'shopping', 'edit', 'edit') = 'edit')
  with check (module_access(household_id, 'shopping', 'edit', 'edit') = 'edit');

create policy "grocery cats view" on grocery_categories for select
  using (module_access(household_id, 'shopping', 'edit', 'edit') in ('view', 'edit'));
create policy "grocery cats write" on grocery_categories for all
  using (module_access(household_id, 'shopping', 'edit', 'edit') = 'edit')
  with check (module_access(household_id, 'shopping', 'edit', 'edit') = 'edit');
