-- Family Hub: 040_documents
-- The household document hub: mortgages, loans, insurance policies,
-- warranties, leases, utility contracts and subscriptions — each with the
-- money obligations that hang off it (repayments, premiums, fees, balloons)
-- and a scan/PDF in a private Storage bucket.
-- Storage path convention: documents/{household_id}/{uuid}.{ext}

create table documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  title text not null,
  doc_type text not null default 'other'
    check (doc_type in ('mortgage','loan','insurance','warranty','lease','utility','subscription','other')),
  provider text,
  reference_no text,
  storage_path text,
  mime text,
  notes text,
  start_date date,
  expiry_date date,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index documents_household_type on documents (household_id, doc_type);
create index documents_household_expiry on documents (household_id, expiry_date);

create table document_obligations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  document_id uuid not null references documents (id) on delete cascade,
  kind text not null default 'other'
    check (kind in ('repayment','premium','fee','payout','other')),
  amount numeric(14, 2),
  frequency text
    check (frequency in ('weekly','fortnightly','monthly','quarterly','yearly','one_off')),
  next_due_date date,
  interest_rate numeric(6, 3),
  balloon_amount numeric(14, 2),
  balloon_date date,
  notes text,
  created_at timestamptz not null default now()
);

create index document_obligations_document on document_obligations (document_id);
create index document_obligations_due on document_obligations (household_id, next_due_date);

-- Module-aware access: override row wins, else role default (owner/adult edit, child none).
-- Mirrors src/lib/modules.ts documents defaults — keep in sync if those change.
create or replace function documents_access(hid uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select access::text from module_permissions
      where household_id = hid and user_id = auth.uid() and module_slug = 'documents'),
    case
      when (select role from household_members
             where household_id = hid and user_id = auth.uid()) in ('owner', 'adult')
      then 'edit' else 'none'
    end
  );
$$;

alter table documents enable row level security;
alter table document_obligations enable row level security;

create policy "documents view" on documents for select using (documents_access(household_id) in ('view','edit'));
create policy "documents edit ins" on documents for insert with check (documents_access(household_id) = 'edit');
create policy "documents edit upd" on documents for update using (documents_access(household_id) = 'edit');
create policy "documents edit del" on documents for delete using (documents_access(household_id) = 'edit');

create policy "documents view" on document_obligations for select using (documents_access(household_id) in ('view','edit'));
create policy "documents edit ins" on document_obligations for insert with check (documents_access(household_id) = 'edit');
create policy "documents edit upd" on document_obligations for update using (documents_access(household_id) = 'edit');
create policy "documents edit del" on document_obligations for delete using (documents_access(household_id) = 'edit');

-- Private storage bucket (10 MB per file: PDFs and document images)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Storage policies: first path segment is the household id (mirrors the photos bucket)
create policy "document objects select" on storage.objects for select
  using (
    bucket_id = 'documents'
    and documents_access((split_part(name, '/', 1))::uuid) in ('view','edit')
  );

create policy "document objects insert" on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and documents_access((split_part(name, '/', 1))::uuid) = 'edit'
  );

create policy "document objects delete" on storage.objects for delete
  using (
    bucket_id = 'documents'
    and documents_access((split_part(name, '/', 1))::uuid) = 'edit'
  );
