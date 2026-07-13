-- Nestly: 021 — family planner events + shopping lists (see applied migration)
create table planner_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  title text not null,
  event_date date not null,
  start_time time,
  end_time time,
  location text,
  notes text,
  assigned uuid[] not null default '{}',
  recurrence text check (recurrence in ('weekly')),
  recurrence_until date,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index planner_events_household_date on planner_events (household_id, event_date);
alter table planner_events enable row level security;
create policy "planner view" on planner_events for select
  using (module_access(household_id, 'planner', 'edit', 'view') in ('view','edit'));
create policy "planner ins" on planner_events for insert
  with check (module_access(household_id, 'planner', 'edit', 'view') = 'edit');
create policy "planner upd" on planner_events for update
  using (module_access(household_id, 'planner', 'edit', 'view') = 'edit');
create policy "planner del" on planner_events for delete
  using (module_access(household_id, 'planner', 'edit', 'view') = 'edit');

create table shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  status text not null default 'open' check (status in ('open','done')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create table shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references shopping_lists (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  position int not null default 0,
  name text not null,
  qty text,
  checked boolean not null default false,
  checked_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index shopping_items_list on shopping_list_items (list_id, position);
alter table shopping_lists enable row level security;
alter table shopping_list_items enable row level security;
create policy "shopping lists view" on shopping_lists for select
  using (module_access(household_id, 'shopping', 'edit', 'edit') in ('view','edit'));
create policy "shopping lists write" on shopping_lists for all
  using (module_access(household_id, 'shopping', 'edit', 'edit') = 'edit')
  with check (module_access(household_id, 'shopping', 'edit', 'edit') = 'edit');
create policy "shopping items view" on shopping_list_items for select
  using (module_access(household_id, 'shopping', 'edit', 'edit') in ('view','edit'));
create policy "shopping items write" on shopping_list_items for all
  using (module_access(household_id, 'shopping', 'edit', 'edit') = 'edit')
  with check (module_access(household_id, 'shopping', 'edit', 'edit') = 'edit');
