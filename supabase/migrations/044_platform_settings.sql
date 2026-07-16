-- Family Hub: 044_platform_settings
-- Platform-wide settings written by platform admins from /admin (service-role
-- client only — no insert/update policies on purpose). All signed-in users can
-- read: the first use is 'nav_default', the global menu layout every household
-- starts from (resolution: personal → household → global → built-in).

create table platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table platform_settings enable row level security;
create policy "settings read" on platform_settings for select to authenticated using (true);
