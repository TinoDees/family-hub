-- Nestly: 054 — the running-low jot list (Kati's habit, digitized).
-- Quick notes collected during the week ("milk", "bin bags") that flow into
-- the shopping Plan step and are cleared when they land on a created list.

create table shopping_notes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  qty text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index shopping_notes_household on shopping_notes (household_id, created_at);

alter table shopping_notes enable row level security;
create policy "notes view" on shopping_notes for select
  using (module_access(household_id, 'shopping', 'edit', 'edit') in ('view', 'edit'));
create policy "notes write" on shopping_notes for all
  using (module_access(household_id, 'shopping', 'edit', 'edit') = 'edit')
  with check (module_access(household_id, 'shopping', 'edit', 'edit') = 'edit');
