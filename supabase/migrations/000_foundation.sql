-- Family Hub: 000_foundation
-- Minimal foundation so auth + household create/join works before the full
-- 23-table schema lands. If the full schema redefines these tables, drop the
-- public schema objects and re-run the full schema instead (no data yet).

create type member_role as enum ('owner', 'adult', 'child');

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default lower(substr(md5(random()::text), 1, 8)),
  base_currency text not null default 'AUD',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table household_members (
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role member_role not null default 'adult',
  display_name text,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- security definer helper avoids RLS self-recursion on household_members
create or replace function is_household_member(hid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

alter table households enable row level security;
alter table household_members enable row level security;

create policy "members read their household"
  on households for select
  using (is_household_member(id));

create policy "owners update their household"
  on households for update
  using (
    exists (
      select 1 from household_members m
      where m.household_id = households.id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

create policy "members read fellow members"
  on household_members for select
  using (is_household_member(household_id));

-- Creation / joining go through RPCs (security definer) so we don't need
-- insert policies that fight RLS ordering.

create or replace function create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into households (name, created_by)
  values (p_name, auth.uid())
  returning id into v_id;

  insert into household_members (household_id, user_id, role, display_name)
  values (
    v_id,
    auth.uid(),
    'owner',
    coalesce(
      (select raw_user_meta_data ->> 'display_name' from auth.users where id = auth.uid()),
      split_part((select email from auth.users where id = auth.uid()), '@', 1)
    )
  );
  return v_id;
end;
$$;

create or replace function join_household_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select id into v_id from households where invite_code = lower(p_code);
  if v_id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into household_members (household_id, user_id, role, display_name)
  values (
    v_id,
    auth.uid(),
    'adult',
    coalesce(
      (select raw_user_meta_data ->> 'display_name' from auth.users where id = auth.uid()),
      split_part((select email from auth.users where id = auth.uid()), '@', 1)
    )
  )
  on conflict (household_id, user_id) do nothing;
  return v_id;
end;
$$;

revoke execute on function create_household(text) from anon;
revoke execute on function join_household_by_code(text) from anon;
