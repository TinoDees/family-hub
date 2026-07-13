-- Nestly: 011_trip_families — families as first-class trip structure
create table trip_families (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index trip_families_trip on trip_families (trip_id);

alter table trip_participants add column family_id uuid references trip_families (id) on delete set null;
alter table trip_participants add column email text;
alter table trip_participants add column is_manager boolean not null default false;

alter table trip_families enable row level security;
create policy "families member view" on trip_families for select
  using (module_access(household_id, 'holidays', 'edit', 'view') in ('view','edit'));
create policy "families member ins" on trip_families for insert
  with check (module_access(household_id, 'holidays', 'edit', 'view') = 'edit');
create policy "families member upd" on trip_families for update
  using (module_access(household_id, 'holidays', 'edit', 'view') = 'edit');
create policy "families member del" on trip_families for delete
  using (module_access(household_id, 'holidays', 'edit', 'view') = 'edit');
create policy "families guest view" on trip_families for select
  using (is_trip_participant(trip_id));

insert into trip_families (trip_id, household_id, name)
select t.id, t.household_id, 'Family ' || split_part(h.name, ' ', greatest(1, array_length(string_to_array(h.name, ' '), 1)))
from trips t join households h on h.id = t.household_id;

update trip_participants p
set family_id = f.id
from trip_families f
where f.trip_id = p.trip_id and p.family_id is null and p.user_id is not null;
