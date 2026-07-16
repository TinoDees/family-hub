-- 045: device lock (Tracey mig-332 pattern, family-sized) + per-user PINs.
-- PIN is a quick RESUME/unlock for an already-authenticated session, stored
-- hashed (pgcrypto bcrypt), verified server-side only. 4 OR 6 digits.
create extension if not exists pgcrypto;

alter table households
  add column if not exists idle_lock_enabled   boolean not null default true,
  add column if not exists idle_lock_minutes   int     not null default 30,
  add column if not exists overnight_logout_at time    not null default '00:00',
  add column if not exists timezone            text    not null default 'Australia/Sydney';

create table user_pins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  pin_hash   text not null,
  pin_set_at timestamptz not null default now()
);
alter table user_pins enable row level security; -- no policies: RPC-only access

create or replace function public.set_user_pin(p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_pin !~ '^([0-9]{4}|[0-9]{6})$' then
    raise exception 'PIN must be exactly 4 or 6 digits';
  end if;
  insert into user_pins (user_id, pin_hash, pin_set_at)
  values (auth.uid(), crypt(p_pin, gen_salt('bf')), now())
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, pin_set_at = now();
end; $$;

create or replace function public.verify_user_pin(p_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  select pin_hash into h from user_pins where user_id = auth.uid();
  if h is null then return false; end if;
  return h = crypt(p_pin, h);
end; $$;

create or replace function public.clear_user_pin()
returns void language sql security definer set search_path = public as $$
  delete from user_pins where user_id = auth.uid();
$$;

create or replace function public.has_user_pin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from user_pins where user_id = auth.uid());
$$;

revoke all on function public.set_user_pin(text) from public;
revoke all on function public.verify_user_pin(text) from public;
revoke all on function public.clear_user_pin() from public;
revoke all on function public.has_user_pin() from public;
grant execute on function public.set_user_pin(text) to authenticated;
grant execute on function public.verify_user_pin(text) to authenticated;
grant execute on function public.clear_user_pin() to authenticated;
grant execute on function public.has_user_pin() to authenticated;
