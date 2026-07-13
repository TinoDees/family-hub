-- Nestly: 019 — agreed exchange rates per trip & currency
create table trip_fx_rates (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  currency text not null,
  agreed_rate numeric(14, 6) not null,
  updated_at timestamptz not null default now(),
  unique (trip_id, currency)
);

alter table trip_fx_rates enable row level security;
create policy "fx member view" on trip_fx_rates for select
  using (module_access(household_id, 'holidays', 'edit', 'view') in ('view','edit'));
create policy "fx member write" on trip_fx_rates for all
  using (module_access(household_id, 'holidays', 'edit', 'view') = 'edit')
  with check (module_access(household_id, 'holidays', 'edit', 'view') = 'edit');
create policy "fx guest view" on trip_fx_rates for select
  using (is_trip_participant(trip_id));
