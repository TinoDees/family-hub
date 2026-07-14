-- 028: push webhook now calls the canonical domain
create or replace function notify_chat_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://nestlyapp.co/api/push/message',
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
  return new;
end;
$$;
