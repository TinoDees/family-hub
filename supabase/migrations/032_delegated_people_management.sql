-- 032: delegated people management (see applied migration delegated_people_management).
-- New grantable module 'people' (defaults: owner=edit, others=none).
-- Iron rules: only the owner deletes members; an owner's role/permissions
-- can be changed by no one but that owner themself.

create or replace function is_owner_user(hid uuid, uid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = uid and role = 'owner'
  );
$$;

create or replace function can_manage_people(hid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select is_household_owner(hid)
    or module_access(hid, 'people', 'none', 'none') = 'edit';
$$;

drop policy "members read own permissions, owners read all" on module_permissions;
drop policy "owners insert permissions" on module_permissions;
drop policy "owners update permissions" on module_permissions;
drop policy "owners delete permissions" on module_permissions;

create policy "read own or managed permissions" on module_permissions for select
  using (user_id = auth.uid() or can_manage_people(household_id));
create policy "managers write permissions" on module_permissions for insert
  with check (
    can_manage_people(household_id)
    and (not is_owner_user(household_id, user_id) or auth.uid() = user_id)
  );
create policy "managers update permissions" on module_permissions for update
  using (
    can_manage_people(household_id)
    and (not is_owner_user(household_id, user_id) or auth.uid() = user_id)
  );
create policy "managers delete permissions" on module_permissions for delete
  using (
    can_manage_people(household_id)
    and (not is_owner_user(household_id, user_id) or auth.uid() = user_id)
  );

drop policy "owners manage invites" on invites;
create policy "managers manage invites" on invites for all
  using (can_manage_people(household_id))
  with check (can_manage_people(household_id));

create or replace function set_member_role(p_household uuid, p_user uuid, p_role member_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not can_manage_people(p_household) then
    raise exception 'You do not have permission to manage people';
  end if;
  if p_role = 'owner' and not is_household_owner(p_household) then
    raise exception 'Only the owner can make someone an owner';
  end if;
  if is_owner_user(p_household, p_user) and auth.uid() <> p_user then
    raise exception 'Only the owner can change their own role';
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
-- remove_member stays owner-only: deleting people is the owner's alone.
