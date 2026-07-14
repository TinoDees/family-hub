-- Nestly: 022 — guest expense RETURNING fix + household login activity
create policy "guests see expenses they paid" on trip_expenses for select
  using (exists (
    select 1 from trip_participants me
    where me.id = trip_expenses.paid_by and me.user_id = auth.uid()
  ));

create or replace function household_login_activity(hid uuid)
returns table (member_name text, email text, action text, happened_at timestamptz)
language sql security definer set search_path = public stable as $$
  select
    coalesce(m.display_name, u.email) as member_name,
    u.email::text,
    (a.payload ->> 'action') as action,
    a.created_at
  from auth.audit_log_entries a
  join auth.users u on u.id::text = (a.payload ->> 'actor_id')
  join household_members m on m.user_id = u.id
  where m.household_id = hid
    and is_household_owner(hid)
    and (a.payload ->> 'action') in ('login', 'logout', 'user_signedup', 'token_refreshed')
  order by a.created_at desc
  limit 100;
$$;

revoke execute on function household_login_activity(uuid) from anon;
