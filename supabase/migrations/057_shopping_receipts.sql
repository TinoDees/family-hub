-- Nestly: 057 — receipt scanning on shopping lists: item prices, list receipt
-- record, last-price memory on pantry items, and a shopping-scoped bucket.
alter table shopping_list_items add column price numeric(10,2);
alter table shopping_lists
  add column receipt_path text,
  add column receipt_store text,
  add column receipt_total numeric(10,2),
  add column spent_at timestamptz;
alter table pantry_items
  add column last_price numeric(10,2),
  add column last_price_at timestamptz;

insert into storage.buckets (id, name) values ('receipts', 'receipts')
on conflict (id) do nothing;

create policy "receipt objects insert" on storage.objects for insert
  with check (bucket_id = 'receipts'
    and module_access((split_part(name, '/', 1))::uuid, 'shopping', 'edit', 'edit') = 'edit');
create policy "receipt objects select" on storage.objects for select
  using (bucket_id = 'receipts'
    and module_access((split_part(name, '/', 1))::uuid, 'shopping', 'edit', 'edit') in ('view', 'edit'));
create policy "receipt objects delete" on storage.objects for delete
  using (bucket_id = 'receipts'
    and module_access((split_part(name, '/', 1))::uuid, 'shopping', 'edit', 'edit') = 'edit');
