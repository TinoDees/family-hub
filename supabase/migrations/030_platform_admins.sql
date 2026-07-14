-- 030: platform_admins + household_module_flags
-- Platform-owner admin area: who may access /admin, and per-household module kill switches.

-- ---------------------------------------------------------------------------
-- platform_admins: users allowed into the /admin area.
-- Writes are service-role only (no insert/update/delete policies).
-- ---------------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create policy "users read own platform admin row"
  on public.platform_admins for select
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- household_module_flags: platform-level per-household module enable/disable.
-- NOT yet enforced in app permission logic (wiring comes later).
-- Writes are service-role only.
-- ---------------------------------------------------------------------------
create table if not exists public.household_module_flags (
  household_id uuid not null references public.households(id) on delete cascade,
  module_id text not null,
  enabled boolean not null default true,
  primary key (household_id, module_id)
);

alter table public.household_module_flags enable row level security;

create policy "members read module flags"
  on public.household_module_flags for select
  using (is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Seed: Tino as platform admin.
-- ---------------------------------------------------------------------------
insert into public.platform_admins (user_id)
select id from auth.users where email = 'tino.dees@germanbutchery.com.au'
on conflict do nothing;
