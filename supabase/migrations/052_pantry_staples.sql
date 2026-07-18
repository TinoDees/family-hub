-- Nestly: 052 — pantry staples + shopping item categories (shopping v2, S1).
-- Staples every household needs besides recipe ingredients. min/max/soh are all
-- OPTIONAL (the Kati rule: a bare name is a complete entry). soh columns ship
-- now so S2's review worksheet needs no schema change.

create table pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  category text not null default 'other',
  unit text,
  min_qty numeric(10, 2),
  max_qty numeric(10, 2),
  soh numeric(10, 2),
  soh_updated_at timestamptz,
  position int not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (min_qty is null or min_qty >= 0),
  check (max_qty is null or max_qty >= 0),
  check (min_qty is null or max_qty is null or max_qty >= min_qty)
);
create index pantry_items_household on pantry_items (household_id, category, position);

alter table pantry_items enable row level security;
create policy "pantry view" on pantry_items for select
  using (module_access(household_id, 'shopping', 'edit', 'edit') in ('view', 'edit'));
create policy "pantry write" on pantry_items for all
  using (module_access(household_id, 'shopping', 'edit', 'edit') = 'edit')
  with check (module_access(household_id, 'shopping', 'edit', 'edit') = 'edit');

-- store-walk grouping on lists; guessed on insert, quietly correctable
alter table shopping_list_items add column category text;
