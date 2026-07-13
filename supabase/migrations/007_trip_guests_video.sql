-- Nestly: 007_trip_guests_video
-- Guest access: friends claim a participant slot via invite link and see ONLY
-- their trip, and within it only expenses they paid or share in.
-- Plus a temp bucket for video->recipe processing.

create table trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  participant_id uuid not null references trip_participants (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  accepted_at timestamptz,
  revoked_at timestamptz
);

alter table trip_invites enable row level security;
create policy "trip invites managed by hosts" on trip_invites for all
  using (module_access(household_id, 'holidays', 'edit', 'view') = 'edit')
  with check (module_access(household_id, 'holidays', 'edit', 'view') = 'edit');

-- helpers (security definer so guest policies don't recurse)
create or replace function is_trip_participant(tid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from trip_participants where trip_id = tid and user_id = auth.uid()
  );
$$;

create or replace function participant_in_expense(eid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1
    from trip_expenses e
    join trip_participants me on me.trip_id = e.trip_id and me.user_id = auth.uid()
    where e.id = eid
      and (e.paid_by = me.id
           or exists (select 1 from trip_expense_shares s
                       where s.expense_id = e.id and s.participant_id = me.id))
  );
$$;

-- guest visibility policies (additive to household policies)
create policy "guests see their trip" on trips for select
  using (is_trip_participant(id));
create policy "guests see fellow participants" on trip_participants for select
  using (is_trip_participant(trip_id));
create policy "guests see own expenses" on trip_expenses for select
  using (participant_in_expense(id));
create policy "guests add expenses" on trip_expenses for insert
  with check (is_trip_participant(trip_id));
create policy "guests see own shares" on trip_expense_shares for select
  using (participant_in_expense(expense_id));
create policy "guests add shares to own expenses" on trip_expense_shares for insert
  with check (participant_in_expense(expense_id));

-- guests + trip albums (receipt scans)
create policy "guests see trip albums" on albums for select
  using (trip_id is not null and is_trip_participant(trip_id));
create policy "guests create trip albums" on albums for insert
  with check (trip_id is not null and is_trip_participant(trip_id));
create policy "guests see trip photos" on photos for select
  using (exists (
    select 1 from albums a
    where a.id = album_id and a.trip_id is not null and is_trip_participant(a.trip_id)
  ));
create policy "guests add trip photos" on photos for insert
  with check (exists (
    select 1 from albums a
    where a.id = album_id and a.trip_id is not null and is_trip_participant(a.trip_id)
  ));

create policy "guest photo objects select" on storage.objects for select
  using (
    bucket_id = 'photos'
    and exists (
      select 1 from albums a
      where a.id::text = split_part(name, '/', 2)
        and a.trip_id is not null and is_trip_participant(a.trip_id)
    )
  );
create policy "guest photo objects insert" on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and exists (
      select 1 from albums a
      where a.id::text = split_part(name, '/', 2)
        and a.trip_id is not null and is_trip_participant(a.trip_id)
    )
  );

-- invite preview + claim
create or replace function get_trip_invite(p_token text)
returns table (trip_name text, participant_name text, household_name text, status text)
language sql security definer set search_path = public stable as $$
  select t.name, p.name, h.name,
    case
      when i.revoked_at is not null then 'revoked'
      when i.accepted_at is not null then 'accepted'
      when i.expires_at < now() then 'expired'
      when p.user_id is not null then 'claimed'
      else 'pending'
    end
  from trip_invites i
  join trips t on t.id = i.trip_id
  join trip_participants p on p.id = i.participant_id
  join households h on h.id = i.household_id
  where i.token = p_token;
$$;

create or replace function accept_trip_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_invite trip_invites%rowtype;
  v_user_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_invite from trip_invites where token = p_token for update;
  if v_invite.id is null then raise exception 'Invite not found'; end if;
  if v_invite.revoked_at is not null then raise exception 'This invite has been revoked'; end if;
  if v_invite.expires_at < now() then raise exception 'This invite has expired'; end if;

  select user_id into v_user_id from trip_participants where id = v_invite.participant_id;
  if v_user_id is not null and v_user_id <> auth.uid() then
    raise exception 'This spot has already been claimed';
  end if;

  update trip_participants set user_id = auth.uid() where id = v_invite.participant_id;
  update trip_invites set accepted_at = coalesce(accepted_at, now()) where id = v_invite.id;
  return v_invite.trip_id;
end;
$$;

revoke execute on function accept_trip_invite(text) from anon;

-- temp bucket for video->recipe (cleaned up after processing)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('video-temp', 'video-temp', false, 104857600,
        array['video/mp4','video/quicktime','video/webm','video/x-m4v'])
on conflict (id) do nothing;

create policy "video temp insert" on storage.objects for insert
  with check (
    bucket_id = 'video-temp'
    and module_access((split_part(name, '/', 1))::uuid, 'recipes', 'edit', 'view') = 'edit'
  );
create policy "video temp select" on storage.objects for select
  using (
    bucket_id = 'video-temp'
    and module_access((split_part(name, '/', 1))::uuid, 'recipes', 'edit', 'view') = 'edit'
  );
create policy "video temp delete" on storage.objects for delete
  using (
    bucket_id = 'video-temp'
    and module_access((split_part(name, '/', 1))::uuid, 'recipes', 'edit', 'view') = 'edit'
  );
