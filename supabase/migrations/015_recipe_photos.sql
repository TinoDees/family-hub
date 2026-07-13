-- Nestly: 015 — recipe photos with hero image
create table recipe_photos (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index recipe_photos_recipe on recipe_photos (recipe_id, created_at);

alter table recipes add column hero_photo_id uuid references recipe_photos (id) on delete set null;

alter table recipe_photos enable row level security;
create policy "recipe photos view" on recipe_photos for select
  using (module_access(household_id, 'recipes', 'edit', 'view') in ('view','edit'));
create policy "recipe photos ins" on recipe_photos for insert
  with check (module_access(household_id, 'recipes', 'edit', 'view') = 'edit');
create policy "recipe photos del" on recipe_photos for delete
  using (module_access(household_id, 'recipes', 'edit', 'view') = 'edit');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

create policy "recipe photo objects view" on storage.objects for select
  using (
    bucket_id = 'recipe-photos'
    and module_access((split_part(objects.name, '/', 1))::uuid, 'recipes', 'edit', 'view') in ('view','edit')
  );
create policy "recipe photo objects ins" on storage.objects for insert
  with check (
    bucket_id = 'recipe-photos'
    and module_access((split_part(objects.name, '/', 1))::uuid, 'recipes', 'edit', 'view') = 'edit'
  );
create policy "recipe photo objects del" on storage.objects for delete
  using (
    bucket_id = 'recipe-photos'
    and module_access((split_part(objects.name, '/', 1))::uuid, 'recipes', 'edit', 'view') = 'edit'
  );
