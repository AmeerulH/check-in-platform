alter table public.guests
  add column if not exists ticket_type text,
  add column if not exists region text,
  add column if not exists speaker_mode text,
  add column if not exists email_marked_sent_at timestamptz,
  add column if not exists email_marked_sent_by uuid references public.event_memberships(id) on delete set null;

alter table public.guests
  add constraint guests_speaker_mode_check
  check (speaker_mode is null or speaker_mode in ('in_person', 'virtual'));

alter table public.imports alter column uploaded_by drop not null;
create unique index imports_one_sheet_sync_in_progress
  on public.imports(event_id, source_filename)
  where status = 'previewed' and source_filename = 'GTP2026 Registration Namelist / Sheet1';

create table public.guest_source_changes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  proposed jsonb not null,
  source_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.event_memberships(id) on delete set null,
  unique (guest_id, source_hash)
);

create index guest_source_changes_event_status_idx
  on public.guest_source_changes(event_id, status, created_at desc);
alter table public.guest_source_changes enable row level security;
create policy "organizers review source changes"
  on public.guest_source_changes for all to authenticated
  using (public.has_event_role(event_id, array['organizer']::public.app_role[]))
  with check (public.has_event_role(event_id, array['organizer']::public.app_role[]));

create function public.apply_guest_source_change(target_change_id uuid, reviewer_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
declare source_change public.guest_source_changes%rowtype;
begin
  select * into source_change from public.guest_source_changes
  where id = target_change_id and status = 'pending' for update;
  if not found then return false; end if;
  update public.guests set
    display_name = source_change.proposed->>'display_name',
    ticket_type = source_change.proposed->>'ticket_type',
    category = source_change.proposed->>'category',
    title = source_change.proposed->>'title',
    organization = source_change.proposed->>'organization',
    region = source_change.proposed->>'region',
    country = source_change.proposed->>'country',
    external_reference = source_change.proposed->>'external_reference'
  where id = source_change.guest_id and event_id = source_change.event_id;
  update public.guest_source_changes
    set status = 'applied', reviewed_at = now(), reviewed_by = reviewer_id
  where id = target_change_id;
  return true;
end;
$$;
revoke all on function public.apply_guest_source_change(uuid, uuid) from public;
grant execute on function public.apply_guest_source_change(uuid, uuid) to service_role;

create table public.event_documents (
  event_id uuid not null references public.events(id) on delete cascade,
  document_key text not null,
  storage_path text not null,
  file_name text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.event_memberships(id) on delete set null,
  primary key (event_id, document_key),
  check (document_key = 'participant_guide')
);
alter table public.event_documents enable row level security;
create policy "organizers manage event documents"
  on public.event_documents for all to authenticated
  using (public.has_event_role(event_id, array['organizer']::public.app_role[]))
  with check (public.has_event_role(event_id, array['organizer']::public.app_role[]));

insert into storage.buckets (id, name, public)
values ('event-documents', 'event-documents', false)
on conflict (id) do nothing;
