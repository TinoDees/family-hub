-- Nestly: 009_trip_expense_items — line-item allocation per expense
create table trip_expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references trip_expenses (id) on delete cascade,
  position int not null default 0,
  description text not null,
  amount numeric(12, 2) not null,
  consumed_by uuid references trip_participants (id) on delete set null,
  created_at timestamptz not null default now()
);

create index trip_expense_items_expense on trip_expense_items (expense_id, position);

alter table trip_expense_items enable row level security;

create or replace function expense_household_access(eid uuid, level text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from trip_expenses e
    where e.id = eid
      and case when level = 'edit'
        then module_access(e.household_id, 'holidays', 'edit', 'view') = 'edit'
        else module_access(e.household_id, 'holidays', 'edit', 'view') in ('view','edit')
      end
  );
$$;

create policy "items member view" on trip_expense_items for select
  using (expense_household_access(expense_id, 'view'));
create policy "items member ins" on trip_expense_items for insert
  with check (expense_household_access(expense_id, 'edit'));
create policy "items member upd" on trip_expense_items for update
  using (expense_household_access(expense_id, 'edit'));
create policy "items member del" on trip_expense_items for delete
  using (expense_household_access(expense_id, 'edit'));

create policy "items guest view" on trip_expense_items for select
  using (participant_in_expense(expense_id));
create policy "items guest ins" on trip_expense_items for insert
  with check (participant_in_expense(expense_id));
