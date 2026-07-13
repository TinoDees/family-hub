-- Nestly: 014 — recipe provenance (source link / kept video) + planner servings
alter table recipes add column source_url text;
alter table recipes add column video_path text;
alter table meal_plan_entries add column servings int;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-videos', 'recipe-videos', false, 157286400,
        array['video/mp4','video/quicktime','video/webm','video/x-m4v'])
on conflict (id) do nothing;

create policy "recipe videos view" on storage.objects for select
  using (
    bucket_id = 'recipe-videos'
    and module_access((split_part(objects.name, '/', 1))::uuid, 'recipes', 'edit', 'view') in ('view','edit')
  );
create policy "recipe videos insert" on storage.objects for insert
  with check (
    bucket_id = 'recipe-videos'
    and module_access((split_part(objects.name, '/', 1))::uuid, 'recipes', 'edit', 'view') = 'edit'
  );
create policy "recipe videos delete" on storage.objects for delete
  using (
    bucket_id = 'recipe-videos'
    and module_access((split_part(objects.name, '/', 1))::uuid, 'recipes', 'edit', 'view') = 'edit'
  );
