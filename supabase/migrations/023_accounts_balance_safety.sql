alter table finance_accounts add column opening_balance numeric(14,2) not null default 0;
alter table households add column device_safety_service text
  check (device_safety_service in ('google','apple','life360'));
