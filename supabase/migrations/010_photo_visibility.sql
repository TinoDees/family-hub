-- Nestly: 010_photo_visibility
-- Per-photo visibility: 'trip' = family + trip guests, 'household' = family only.
alter table photos add column visibility text not null default 'trip'
  check (visibility in ('household', 'trip'));

drop policy "guests see trip photos" on photos;
create policy "guests see trip photos" on photos for select
  using (
    visibility = 'trip'
    and exists (
      select 1 from albums a
      where a.id = album_id and a.trip_id is not null and is_trip_participant(a.trip_id)
    )
  );

drop policy "guest photo objects select" on storage.objects;
create policy "guest photo objects select" on storage.objects for select
  using (
    bucket_id = 'photos'
    and exists (
      select 1
      from photos p
      join albums a on a.id = p.album_id
      where p.storage_path = objects.name
        and p.visibility = 'trip'
        and a.trip_id is not null
        and is_trip_participant(a.trip_id)
    )
  );
