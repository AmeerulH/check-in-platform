-- The registration Sheet is the source of truth and may list several people under one email
-- (assistants registering for others, shared inboxes). Every Sheet row must become a guest, so
-- an email no longer identifies exactly one guest. Passes and check-ins are keyed by guest id.
alter table public.guests drop constraint if exists guests_event_id_normalized_email_key;

create index if not exists guests_event_email_idx
  on public.guests (event_id, normalized_email);
