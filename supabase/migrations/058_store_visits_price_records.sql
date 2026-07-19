-- Nestly: 058 — shopping trip mode + the price-history dataset.
-- A store visit = "start shopping at Aldi" … tick … "finish & scan receipt".
-- price_records collects every receipt line per retailer over time — the raw
-- material for future "this is cheaper at X" advice.

create table store_visits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  retailer_id uuid references retailers (id) on delete set null,
  store_label text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  receipt_path text,
  receipt_store text,
  receipt_total numeric(10,2),
  created_by uuid references auth.users (id)
);
create index store_visits_household on store_visits (household_id, started_at desc);

create table price_records (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  visit_id uuid references store_visits (id) on delete set null,
  retailer_id uuid references retailers (id) on delete set null,
  store_name text,
  item_name text not null,
  line_label text,
  pantry_item_id uuid references pantry_items (id) on delete set null,
  price numeric(10,2) not null,
  recorded_at timestamptz not null default now()
);
create index price_records_item on price_records (household_id, item_name);
create index price_records_pantry on price_records (household_id, pantry_item_id);

alter table shopping_list_items
  add column visit_id uuid references store_visits (id) on delete set null;

alter table store_visits enable row level security;
alter table price_records enable row level security;

create policy "visits view" on store_visits for select
  using (module_access(household_id, 'shopping', 'edit', 'edit') in ('view', 'edit'));
create policy "visits write" on store_visits for all
  using (module_access(household_id, 'shopping', 'edit', 'edit') = 'edit')
  with check (module_access(household_id, 'shopping', 'edit', 'edit') = 'edit');

create policy "price records view" on price_records for select
  using (module_access(household_id, 'shopping', 'edit', 'edit') in ('view', 'edit'));
create policy "price records write" on price_records for all
  using (module_access(household_id, 'shopping', 'edit', 'edit') = 'edit')
  with check (module_access(household_id, 'shopping', 'edit', 'edit') = 'edit');
