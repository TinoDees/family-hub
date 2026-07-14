-- Nestly: 024 — photo sections + family/trip chat (see applied migration)
alter table photos add column section text;

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_kind text not null check (channel_kind in ('household', 'trip')),
  channel_id uuid not null,
  sender uuid not null references auth.users (id),
  body text not null,
  created_at timestamptz not null default now()
);
create index chat_messages_channel on chat_messages (channel_kind, channel_id, created_at desc);

create or replace function can_chat(p_kind text, p_channel uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select case
    when p_kind = 'household'
      then module_access(p_channel, 'messages', 'edit', 'edit') in ('view', 'edit')
    when p_kind = 'trip'
      then is_trip_participant(p_channel)
        or module_access((select household_id from trips where id = p_channel), 'messages', 'edit', 'edit') in ('view', 'edit')
    else false
  end;
$$;

alter table chat_messages enable row level security;
create policy "chat read" on chat_messages for select using (can_chat(channel_kind, channel_id));
create policy "chat write" on chat_messages for insert
  with check (sender = auth.uid() and can_chat(channel_kind, channel_id));
alter publication supabase_realtime add table chat_messages;
