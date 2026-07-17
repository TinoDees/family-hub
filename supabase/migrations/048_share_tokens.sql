-- Family Hub: 048_share_tokens
-- iPhones can't share to installed web apps (iOS has no Web Share Target),
-- so iOS users get an Apple Shortcut instead: it POSTs the shared content to
-- /api/share-in with a personal token. Tokens are created from the
-- "iPhone sharing" page and validated by the endpoint via the service role.

create table share_tokens (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table share_tokens enable row level security;

-- members manage only their own tokens; the endpoint reads via service role
create policy "share tokens own select" on share_tokens for select using (user_id = auth.uid());
create policy "share tokens own insert" on share_tokens for insert with check (
  user_id = auth.uid()
  and exists (select 1 from household_members hm
              where hm.household_id = share_tokens.household_id and hm.user_id = auth.uid())
);
create policy "share tokens own delete" on share_tokens for delete using (user_id = auth.uid());
