-- Family Hub: 060_library
-- Family Digital Library — two shelves in one module:
--   1) Our shelf: DRM-free e-books (.epub), PDFs and audiobooks a member
--      legitimately owns, uploaded to the private 'library' bucket and shared
--      with the household. Upload is gated behind an "I own this" confirmation
--      (stored per book — shifts compliance onus to the uploader).
--   2) Google Play Books: each member connects their OWN Google account
--      (OAuth offline, refresh token stored server-side); their Play Books
--      shelves are cached here so the household sees one combined Google
--      shelf. Files never leave Google — DRM stays intact, we deep-link out.
-- Storage path convention: library/{household_id}/books/{uuid}.{ext}
--                          library/{household_id}/covers/{uuid}.webp

create table library_books (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  owner_id uuid references auth.users (id),
  title text not null,
  author text,
  file_type text not null check (file_type in ('epub','pdf','audio')),
  storage_path text not null,
  cover_path text,
  mime text,
  file_bytes bigint,
  ownership_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create index library_books_household on library_books (household_id, title);

-- Per-member reading/listening position (epub CFI, audio seconds or pdf page).
create table library_progress (
  book_id uuid not null references library_books (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  position text,
  percent numeric(5, 2),
  updated_at timestamptz not null default now(),
  primary key (book_id, user_id)
);

-- One Google connection per member. Tokens are only ever readable by the
-- member themselves via RLS; the combined-shelf sync reads them server-side
-- with the service role. Never send tokens to the browser.
create table library_google_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  google_email text,
  refresh_token text not null,
  access_token text,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz
);

create index library_google_accounts_household on library_google_accounts (household_id);

-- Cached Play Books volumes per connected member (metadata only, no files).
create table library_google_books (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  volume_id text not null,
  title text not null,
  authors text,
  thumbnail_url text,
  info_link text,
  fetched_at timestamptz not null default now(),
  unique (user_id, volume_id)
);

create index library_google_books_household on library_google_books (household_id, title);

-- Module-aware access: override row wins, else role default.
-- Mirrors src/lib/modules.ts library defaults (owner/adult edit, child VIEW)
-- — keep in sync if those change.
create or replace function library_access(hid uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select access::text from module_permissions
      where household_id = hid and user_id = auth.uid() and module_slug = 'library'),
    case (select role::text from household_members
           where household_id = hid and user_id = auth.uid())
      when 'owner' then 'edit'
      when 'adult' then 'edit'
      when 'child' then 'view'
      else 'none'
    end
  );
$$;

alter table library_books enable row level security;
alter table library_progress enable row level security;
alter table library_google_accounts enable row level security;
alter table library_google_books enable row level security;

create policy "library view" on library_books for select using (library_access(household_id) in ('view','edit'));
create policy "library edit ins" on library_books for insert with check (library_access(household_id) = 'edit');
create policy "library edit upd" on library_books for update using (library_access(household_id) = 'edit');
create policy "library edit del" on library_books for delete using (library_access(household_id) = 'edit');

-- Progress is personal: each member reads/writes only their own rows, and
-- only inside a household whose library they can at least view.
create policy "library progress sel" on library_progress for select
  using (user_id = auth.uid());
create policy "library progress ins" on library_progress for insert
  with check (user_id = auth.uid() and library_access(household_id) in ('view','edit'));
create policy "library progress upd" on library_progress for update
  using (user_id = auth.uid());
create policy "library progress del" on library_progress for delete
  using (user_id = auth.uid());

-- Google connections: strictly the member's own row. Other members never see
-- tokens; the page lists connections via the service role (safe fields only).
create policy "google account sel" on library_google_accounts for select
  using (user_id = auth.uid());
create policy "google account ins" on library_google_accounts for insert
  with check (user_id = auth.uid());
create policy "google account upd" on library_google_accounts for update
  using (user_id = auth.uid());
create policy "google account del" on library_google_accounts for delete
  using (user_id = auth.uid());

-- Cached Google volumes: household-readable, writable only for yourself.
create policy "google books sel" on library_google_books for select
  using (library_access(household_id) in ('view','edit'));
create policy "google books ins" on library_google_books for insert
  with check (user_id = auth.uid() and library_access(household_id) in ('view','edit'));
create policy "google books del" on library_google_books for delete
  using (user_id = auth.uid());

-- Private storage bucket. 200 MB per file — audiobooks are chunky.
-- (Supabase plan-level upload caps still apply on top of this.)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library', 'library', false, 209715200, array[
  'application/epub+zip',
  'application/pdf',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/x-m4b',
  'image/jpeg',
  'image/png',
  'image/webp'
])
on conflict (id) do nothing;

-- Storage policies: first path segment is the household id (mirrors documents).
create policy "library objects select" on storage.objects for select
  using (
    bucket_id = 'library'
    and library_access((split_part(name, '/', 1))::uuid) in ('view','edit')
  );

create policy "library objects insert" on storage.objects for insert
  with check (
    bucket_id = 'library'
    and library_access((split_part(name, '/', 1))::uuid) = 'edit'
  );

create policy "library objects delete" on storage.objects for delete
  using (
    bucket_id = 'library'
    and library_access((split_part(name, '/', 1))::uuid) = 'edit'
  );
