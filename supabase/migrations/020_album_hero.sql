alter table albums add column hero_photo_id uuid references photos (id) on delete set null;
