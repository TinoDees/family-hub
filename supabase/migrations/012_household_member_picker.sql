-- Nestly: 012 — household member picker support
alter table trip_families add column linked_household_id uuid references households (id) on delete set null;

update trip_families tf
set linked_household_id = tf.household_id
where exists (
  select 1 from trip_participants p
  join household_members m on m.user_id = p.user_id and m.household_id = tf.household_id
  where p.family_id = tf.id
);

create or replace function household_member_emails(hid uuid)
returns table (user_id uuid, email text, display_name text)
language sql security definer set search_path = public stable as $$
  select m.user_id, u.email::text, m.display_name
  from household_members m
  join auth.users u on u.id = m.user_id
  where m.household_id = hid
    and module_access(hid, 'holidays', 'edit', 'view') = 'edit';
$$;

revoke execute on function household_member_emails(uuid) from anon;
