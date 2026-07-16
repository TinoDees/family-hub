-- Family Hub: 042_nav_prefs
-- Tracey-style customisable navigation, family-sized. One row per scope:
--   user_id null  = the household's default menu (owner arranges it)
--   user_id set   = that member's personal menu (overrides the household default)
-- layout is an ordered jsonb array [{"slug": "...", "hidden": bool}].
-- The layout only ARRANGES the menu — module access is still resolved by
-- permissions (module_permissions + role defaults + platform flags), so
-- arranging can never expose anything.

create table nav_prefs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  layout jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create unique index nav_prefs_household_default on nav_prefs (household_id) where user_id is null;
create unique index nav_prefs_per_user on nav_prefs (household_id, user_id) where user_id is not null;

alter table nav_prefs enable row level security;

-- any member reads both scopes (needed to render their nav)
create policy "nav read" on nav_prefs for select using (
  exists (select 1 from household_members hm
          where hm.household_id = nav_prefs.household_id and hm.user_id = auth.uid())
);

-- members manage their own personal row
create policy "nav own ins" on nav_prefs for insert with check (
  user_id = auth.uid()
  and exists (select 1 from household_members hm
              where hm.household_id = nav_prefs.household_id and hm.user_id = auth.uid())
);
create policy "nav own upd" on nav_prefs for update using (user_id = auth.uid());
create policy "nav own del" on nav_prefs for delete using (user_id = auth.uid());

-- owners manage the household default row
create policy "nav owner ins" on nav_prefs for insert with check (
  user_id is null
  and exists (select 1 from household_members hm
              where hm.household_id = nav_prefs.household_id
                and hm.user_id = auth.uid() and hm.role = 'owner')
);
create policy "nav owner upd" on nav_prefs for update using (
  user_id is null
  and exists (select 1 from household_members hm
              where hm.household_id = nav_prefs.household_id
                and hm.user_id = auth.uid() and hm.role = 'owner')
);
create policy "nav owner del" on nav_prefs for delete using (
  user_id is null
  and exists (select 1 from household_members hm
              where hm.household_id = nav_prefs.household_id
                and hm.user_id = auth.uid() and hm.role = 'owner')
);
