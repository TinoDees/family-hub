-- 031: atomic conversation creation.
-- INSERT..RETURNING on conversations failed RLS because the SELECT policy
-- (participant-based) can't see the row before participants are inserted.
create or replace function create_conversation(
  p_household uuid,
  p_is_group boolean,
  p_title text,
  p_participants uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv uuid;
  v_target uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from household_members
    where household_id = p_household and user_id = auth.uid()
  ) then
    raise exception 'You are not a member of this household';
  end if;

  foreach v_target in array p_participants loop
    if v_target = auth.uid() then continue; end if;
    if not exists (
      select 1 from household_members
      where household_id = p_household and user_id = v_target
    ) and not exists (
      select 1
      from trip_participants mine
      join trip_participants theirs on theirs.trip_id = mine.trip_id
      where mine.user_id = auth.uid() and theirs.user_id = v_target
    ) then
      raise exception 'You can only message family members and trip companions';
    end if;
  end loop;

  insert into conversations (household_id, is_group, title, created_by)
  values (p_household, p_is_group, nullif(trim(p_title), ''), auth.uid())
  returning id into v_conv;

  insert into conversation_participants (conversation_id, user_id)
  select v_conv, uid
  from unnest(array_append(p_participants, auth.uid())) as uid
  on conflict do nothing;

  return v_conv;
end;
$$;

revoke execute on function create_conversation(uuid, boolean, text, uuid[]) from anon;
