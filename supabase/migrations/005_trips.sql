-- Family Hub: 005_trips
-- Holiday Planner phase 1: trips, participants, split expenses.
-- Participants are named slots — user_id optional, so friends can be tracked
-- before they have accounts. Phase 2 (guest access) lets a guest claim a slot.

create type trip_status as enum ('planning', 'active', 'completed');

create table trips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  destination text,
  start_date date,
  end_date date,
  status trip_status not null default 'planning',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table trip_participants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid references auth.users (id),
  name text not null,
  created_at timestamptz not null default now()
);

create index trip_participants_trip on trip_participants (trip_id);

create table trip_expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'AUD',
  spent_at date not null default current_date,
  paid_by uuid not null references trip_participants (id) on delete cascade,
  receipt_photo_id uuid references photos (id) on delete set null,
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index trip_expenses_trip on trip_expenses (trip_id, spent_at desc);

create table trip_expense_shares (
  expense_id uuid not null references trip_expenses (id) on delete cascade,
  participant_id uuid not null references trip_participants (id) on delete cascade,
  amount numeric(12, 2) not null,
  primary key (expense_id, participant_id)
);

alter table trips enable row level security;
alter table trip_participants enable row level security;
alter table trip_expenses enable row level security;
alter table trip_expense_shares enable row level security;

-- holidays module: adult edit, child view
create policy "trips view" on trips for select
  using (module_access(household_id, 'holidays', 'edit', 'view') in ('view','edit'));
create policy "trips ins" on trips for insert
  with check (module_access(household_id, 'holidays', 'edit', 'view') = 'edit');
create policy "trips upd" on trips for update
  using (module_access(household_id, 'holidays', 'edit', 'view') = 'edit');
create policy "trips del" on trips for delete
  using (module_access(household_id, 'holidays', 'edit', 'view') = 'edit');

create policy "tp view" on trip_participants for select
  using (module_access(household_id, 'holidays', 'edit', 'view') in ('view','edit'));
create policy "tp ins" on trip_participants for insert
  with check (module_access(household_id, 'holidays', 'edit', 'view') = 'edit');
create policy "tp upd" on trip_participants for update
  using (module_access(household_id, 'holidays', 'edit', 'view') = 'edit');
create policy "tp del" on trip_participants for delete
  using (module_access(household_id, 'holidays', 'edit', 'view') = 'edit');

create policy "te view" on trip_expenses for select
  using (module_access(household_id, 'holidays', 'edit', 'view') in ('view','edit'));
create policy "te ins" on trip_expenses for insert
  with check (module_access(household_id, 'holidays', 'edit', 'view') = 'edit');
create policy "te upd" on trip_expenses for update
  using (module_access(household_id, 'holidays', 'edit', 'view') = 'edit');
create policy "te del" on trip_expenses for delete
  using (module_access(household_id, 'holidays', 'edit', 'view') = 'edit');

-- shares: access via the parent expense's household
create policy "tes view" on trip_expense_shares for select
  using (exists (
    select 1 from trip_expenses e where e.id = expense_id
      and module_access(e.household_id, 'holidays', 'edit', 'view') in ('view','edit')
  ));
create policy "tes ins" on trip_expense_shares for insert
  with check (exists (
    select 1 from trip_expenses e where e.id = expense_id
      and module_access(e.household_id, 'holidays', 'edit', 'view') = 'edit'
  ));
create policy "tes del" on trip_expense_shares for delete
  using (exists (
    select 1 from trip_expenses e where e.id = expense_id
      and module_access(e.household_id, 'holidays', 'edit', 'view') = 'edit'
  ));
