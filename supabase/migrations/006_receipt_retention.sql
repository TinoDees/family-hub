-- Family Hub: 006_receipt_retention
-- Per-household auto-cleanup of receipt scans (null = keep forever).
alter table households add column receipt_retention_days int;
