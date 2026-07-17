-- Family Hub: 049_user_device_setup
-- Tracks whether each user has finished (or skipped) the device-aware
-- "Set up your phone" flow at /setup-device. One row per user:
--   completed_at — they pressed "All done" on their platform's path
--   dismissed_at — they pressed "Skip for now" (treated as done for nudging)
-- The dashboard shows a small nudge card only while neither is set.

create table user_device_setup (
  user_id uuid primary key references auth.users (id) on delete cascade,
  platform text, -- "ios" | "android" | "desktop" | "unknown" (dashboard dismiss)
  completed_at timestamptz,
  dismissed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table user_device_setup enable row level security;

-- users manage only their own row
create policy "device setup own select" on user_device_setup
  for select using (user_id = auth.uid());
create policy "device setup own insert" on user_device_setup
  for insert with check (user_id = auth.uid());
create policy "device setup own update" on user_device_setup
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
