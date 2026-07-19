-- Nestly: 056 — per-item comment on shopping list items (set in the Plan
-- worksheet, shown on the list: "the good brand", "2 if on special", ...).
alter table shopping_list_items add column note text;
