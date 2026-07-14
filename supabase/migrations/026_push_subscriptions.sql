-- Nestly: 026 — Web Push subscriptions (one row per browser/device per user)
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- Users see and manage only their own subscriptions.
-- Sending reads everyone's rows via the service-role client (server only).
create policy "users manage own push subscriptions"
  on push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
