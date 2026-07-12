-- Family Hub: 004_photos
-- Albums + photos with a private Storage bucket. Path convention:
--   photos/{household_id}/{album_id}/{uuid}.webp
-- Albums carry an optional trip link for the Holiday Planner later.

create table albums (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  description text,
  trip_id uuid, -- future: references trips(id)
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table photos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  album_id uuid not null references albums (id) on delete cascade,
  storage_path text not null unique,
  caption text,
  uploaded_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index photos_album on photos (album_id, created_at desc);

alter table albums enable row level security;
alter table photos enable row level security;

-- photos module defaults: adult edit, child edit (kids can add holiday snaps)
create policy "albums view" on albums for select
  using (module_access(household_id, 'photos', 'edit', 'edit') in ('view','edit'));
create policy "albums ins" on albums for insert
  with check (module_access(household_id, 'photos', 'edit', 'edit') = 'edit');
create policy "albums upd" on albums for update
  using (module_access(household_id, 'photos', 'edit', 'edit') = 'edit');
create policy "albums del" on albums for delete
  using (module_access(household_id, 'photos', 'edit', 'edit') = 'edit');

create policy "photos view" on photos for select
  using (module_access(household_id, 'photos', 'edit', 'edit') in ('view','edit'));
create policy "photos ins" on photos for insert
  with check (module_access(household_id, 'photos', 'edit', 'edit') = 'edit');
create policy "photos upd" on photos for update
  using (module_access(household_id, 'photos', 'edit', 'edit') = 'edit');
create policy "photos del" on photos for delete
  using (module_access(household_id, 'photos', 'edit', 'edit') = 'edit');

-- Private storage bucket (10 MB per file, images only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg','image/png','image/webp','image/gif','image/heic'])
on conflict (id) do nothing;

-- Storage policies: first path segment is the household id
create policy "photo objects select" on storage.objects for select
  using (
    bucket_id = 'photos'
    and module_access((split_part(name, '/', 1))::uuid, 'photos', 'edit', 'edit') in ('view','edit')
  );

create policy "photo objects insert" on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and module_access((split_part(name, '/', 1))::uuid, 'photos', 'edit', 'edit') = 'edit'
  );

create policy "photo objects delete" on storage.objects for delete
  using (
    bucket_id = 'photos'
    and module_access((split_part(name, '/', 1))::uuid, 'photos', 'edit', 'edit') = 'edit'
  );
