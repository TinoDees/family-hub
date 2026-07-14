-- 029: real conversations — 1:1 and group DMs (see applied migration conversations_dms).
-- Parents (owner/adult) of the conversation's household can READ any conversation
-- a child of that household participates in, but can only POST where they belong.

create table conversations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  is_group boolean not null default false,
  title text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table conversation_participants (
  conversation_id uuid not null references conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_participants_user on conversation_participants (user_id);

alter table chat_messages drop constraint chat_messages_channel_kind_check;
alter table chat_messages add constraint chat_messages_channel_kind_check
  check (channel_kind in ('household', 'trip', 'dm'));

create or replace function is_conversation_participant(cid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from conversation_participants
    where conversation_id = cid and user_id = auth.uid()
  );
$$;

create or replace function can_see_conversation(cid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select is_conversation_participant(cid)
  or exists (
    select 1
    from conversations c
    join household_members me
      on me.household_id = c.household_id and me.user_id = auth.uid() and me.role in ('owner', 'adult')
    join conversation_participants cp on cp.conversation_id = c.id
    join household_members kid
      on kid.household_id = c.household_id and kid.user_id = cp.user_id and kid.role = 'child'
    where c.id = cid
  );
$$;

create or replace function can_chat(p_kind text, p_channel uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select case
    when p_kind = 'household'
      then module_access(p_channel, 'messages', 'edit', 'edit') in ('view', 'edit')
    when p_kind = 'trip'
      then is_trip_participant(p_channel)
        or module_access((select household_id from trips where id = p_channel), 'messages', 'edit', 'edit') in ('view', 'edit')
    when p_kind = 'dm'
      then can_see_conversation(p_channel)
    else false
  end;
$$;

create or replace function can_post(p_kind text, p_channel uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select case
    when p_kind = 'dm' then is_conversation_participant(p_channel)
    else can_chat(p_kind, p_channel)
  end;
$$;

drop policy "chat write" on chat_messages;
create policy "chat write" on chat_messages for insert
  with check (sender = auth.uid() and can_post(channel_kind, channel_id));

alter table conversations enable row level security;
alter table conversation_participants enable row level security;

create policy "see conversations" on conversations for select
  using (can_see_conversation(id));
create policy "members create conversations" on conversations for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from household_members
      where household_id = conversations.household_id and user_id = auth.uid()
    )
  );

create policy "see participants" on conversation_participants for select
  using (can_see_conversation(conversation_id));
create policy "creator or participant adds people" on conversation_participants for insert
  with check (
    exists (select 1 from conversations c where c.id = conversation_id and c.created_by = auth.uid())
    or is_conversation_participant(conversation_id)
  );
create policy "own read-marker" on conversation_participants for update
  using (user_id = auth.uid());
create policy "leave conversation" on conversation_participants for delete
  using (user_id = auth.uid());
