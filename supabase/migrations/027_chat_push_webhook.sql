-- 027: fire push notifications from the DB, not the sender's browser.
-- A stale tab can still insert messages; this guarantees the push endpoint
-- is called for every insert regardless of client code version.
create extension if not exists pg_net;

create or replace function notify_chat_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://family-hub-eosin-ten.vercel.app/api/push/message',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', '303b3ffb76776d4689af6d0f006dd9d8262bcee2941f7ec4'
    ),
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'channel_kind', new.channel_kind,
        'channel_id', new.channel_id,
        'sender', new.sender,
        'body', new.body
      )
    ),
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  return new; -- never block a message because the push call failed
end;
$$;

create trigger chat_messages_push
after insert on chat_messages
for each row execute function notify_chat_push();
