-- Nestly: 008 — fix guest storage policies.
-- Inside the policy subquery the unqualified 'name' was captured by
-- albums.name (alias scope), not storage.objects.name, so every guest
-- upload failed RLS. Qualify the column explicitly.
drop policy "guest photo objects select" on storage.objects;
drop policy "guest photo objects insert" on storage.objects;

create policy "guest photo objects select" on storage.objects for select
  using (
    bucket_id = 'photos'
    and exists (
      select 1 from albums a
      where a.id::text = split_part(objects.name, '/', 2)
        and a.trip_id is not null and is_trip_participant(a.trip_id)
    )
  );

create policy "guest photo objects insert" on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and exists (
      select 1 from albums a
      where a.id::text = split_part(objects.name, '/', 2)
        and a.trip_id is not null and is_trip_participant(a.trip_id)
    )
  );
