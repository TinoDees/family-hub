-- Nestly: 055 — invites by phone / open share-link invites.
-- email becomes optional; phone stored for WhatsApp/SMS deep links (no SMS
-- gateway — the inviter's own phone sends the message, zero cost).
alter table invites alter column email drop not null;
alter table invites add column phone text;
