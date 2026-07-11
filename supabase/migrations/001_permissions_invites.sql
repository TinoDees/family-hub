-- Family Hub: 001_permissions_invites
-- Tracey-style access management, family-sized:
--   effective access = per-member override row ?? role default (defined in code, src/lib/modules.ts)
--   levels: none | view | edit
-- Plus email/link invites with single-use tokens.

create extension if not exists pgcrypto;

create type module_access as enum ('none', 'view', 'edit');

-- Per-member overrides. No row = fall back to the member's role default.
create table module_permissions (
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  module_slug text not null,
  access module_access not null default 'none',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  primary key (household_id, user_id, module_slug)
);

create table invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  email text not null,
  role member_role not null default 'adult',
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id),
  revoked_at timestamptz
);

create or replace function is_household_owner(hid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid() and role = 'owner'
  );
$$;

alter table module_permissions enable row level security;
alter table invites enable row level security;

create policy "members read own permissions, owners read all"
  on module_permissions for select
  using (user_id = auth.uid() or is_household_owner(household_id));

create policy "owners insert permissions"
  on module_permissions for insert
  with check (is_household_owner(household_id));

create policy "owners update permissions"
  on module_permissions for update
  using (is_household_owner(household_id));

create policy "owners delete permissions"
  on module_permissions for delete
  using (is_household_owner(household_id));

create policy "owners manage invites"
  on invites for all
  using (is_household_owner(household_id))
  with check (is_household_owner(household_id));

-- Public preview of an invite (for the accept page), by token only.
create or replace function get_invite_by_token(p_token text)
returns table (
  household_name text,
  role member_role,
  email text,
  inviter_name text,
  status text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    h.name,
    i.role,
    i.email,
    coalesce(m.display_name, 'A family member'),
    case
      when i.revoked_at is not null then 'revoked'
      when i.accepted_at is not null then 'accepted'
      when i.expires_at < now() then 'expired'
      else 'pending'
    end
  from invites i
  join households h on h.id = i.household_id
  left join household_members m
    on m.household_id = i.household_id and m.user_id = i.invited_by
  where i.token = p_token;
$$;

create or replace function accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_invite from invites where token = p_token for update;
  if v_invite.id is null then
    raise exception 'Invite not found';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'This invite has been revoked';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'This invite has already been used';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'This invite has expired';
  end if;

  insert into household_members (household_id, user_id, role, display_name)
  values (
    v_invite.household_id,
    auth.uid(),
    v_invite.role,
    coalesce(
      (select raw_user_meta_data ->> 'display_name' from auth.users where id = auth.uid()),
      split_part((select email from auth.users where id = auth.uid()), '@', 1)
    )
  )
  on conflict (household_id, user_id) do nothing;

  update invites
  set accepted_at = now(), accepted_by = auth.uid()
  where id = v_invite.id;

  return v_invite.household_id;
end;
$$;

-- Member management (owner only, last-owner protected).
create or replace function set_member_role(p_household uuid, p_user uuid, p_role member_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_household_owner(p_household) then
    raise exception 'Only the household owner can change roles';
  end if;
  if p_role <> 'owner' and (
    select count(*) from household_members
    where household_id = p_household and role = 'owner' and user_id <> p_user
  ) = 0 and exists (
    select 1 from household_members
    where household_id = p_household and user_id = p_user and role = 'owner'
  ) then
    raise exception 'A household must keep at least one owner';
  end if;
  update household_members
  set role = p_role
  where household_id = p_household and user_id = p_user;
end;
$$;

create or replace function remove_member(p_household uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_household_owner(p_household) then
    raise exception 'Only the household owner can remove members';
  end if;
  if exists (
    select 1 from household_members
    where household_id = p_household and user_id = p_user and role = 'owner'
  ) and (
    select count(*) from household_members
    where household_id = p_household and role = 'owner'
  ) = 1 then
    raise exception 'A household must keep at least one owner';
  end if;
  delete from module_permissions where household_id = p_household and user_id = p_user;
  delete from household_members where household_id = p_household and user_id = p_user;
end;
$$;

revoke execute on function accept_invite(text) from anon;
revoke execute on function set_member_role(uuid, uuid, member_role) from anon;
revoke execute on function remove_member(uuid, uuid) from anon;
