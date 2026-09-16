create extension if not exists citext;
create extension if not exists pgcrypto;

create type public.app_role as enum ('organizer', 'scanner', 'viewer');
create type public.guest_status as enum ('active', 'inactive');
create type public.import_status as enum ('previewed', 'committed', 'failed');
create type public.scan_outcome as enum ('valid_first', 'valid_repeat');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (timezone = 'Asia/Kuala_Lumpur'),
  check (ends_at > starts_at)
);

create table public.event_days (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  local_date date not null,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (event_id, local_date),
  check (closes_at > opens_at)
);

create table public.event_memberships (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  normalized_email citext not null,
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, normalized_email),
  check (normalized_email = lower(trim(normalized_email::text)))
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  normalized_email citext not null,
  display_name text not null,
  organization text,
  title text,
  phone text,
  category text,
  country text,
  internal_notes text,
  external_reference text,
  status public.guest_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, normalized_email),
  check (normalized_email = lower(trim(normalized_email::text))),
  check (length(trim(display_name)) > 0)
);

create table public.guest_credentials (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete cascade,
  token_digest text not null unique,
  version integer not null default 1 check (version > 0),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.event_memberships(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index guest_credentials_one_active_per_guest
  on public.guest_credentials (guest_id)
  where revoked_at is null;

create table public.scanner_devices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, auth_user_id, label),
  check (length(trim(label)) > 0)
);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  uploaded_by uuid not null references public.event_memberships(id) on delete restrict,
  source_filename text not null,
  status public.import_status not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

create table public.daily_attendance (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete cascade,
  event_day_id uuid not null references public.event_days(id) on delete cascade,
  first_scan_at timestamptz not null,
  last_scan_at timestamptz not null,
  scan_count integer not null default 1 check (scan_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_day_id, guest_id),
  check (last_scan_at >= first_scan_at)
);

create table public.scan_events (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete restrict,
  event_day_id uuid not null references public.event_days(id) on delete restrict,
  membership_id uuid not null references public.event_memberships(id) on delete restrict,
  device_id uuid not null references public.scanner_devices(id) on delete restrict,
  client_scan_id uuid not null,
  captured_at timestamptz,
  received_at timestamptz not null default now(),
  outcome public.scan_outcome not null,
  created_at timestamptz not null default now(),
  unique (device_id, client_scan_id)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  actor_membership_id uuid references public.event_memberships(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (length(trim(action)) > 0),
  check (length(trim(entity_type)) > 0)
);

create index event_days_event_id_local_date_idx
  on public.event_days (event_id, local_date);
create index guests_event_id_status_idx
  on public.guests (event_id, status);
create index guests_event_id_display_name_idx
  on public.guests (event_id, display_name);
create index memberships_event_id_role_active_idx
  on public.event_memberships (event_id, role, active);
create index scan_events_event_day_received_at_idx
  on public.scan_events (event_day_id, received_at desc);
create index scan_events_guest_received_at_idx
  on public.scan_events (guest_id, received_at desc);
create index daily_attendance_event_day_idx
  on public.daily_attendance (event_day_id);
create index audit_events_event_created_at_idx
  on public.audit_events (event_id, created_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create trigger event_memberships_set_updated_at
before update on public.event_memberships
for each row execute function public.set_updated_at();

create trigger guests_set_updated_at
before update on public.guests
for each row execute function public.set_updated_at();

create trigger scanner_devices_set_updated_at
before update on public.scanner_devices
for each row execute function public.set_updated_at();

create trigger daily_attendance_set_updated_at
before update on public.daily_attendance
for each row execute function public.set_updated_at();

create function public.current_event_role(target_event_id uuid)
returns public.app_role
language sql
stable
security definer
set search_path = public, auth
as $$
  select membership.role
  from public.event_memberships as membership
  where membership.event_id = target_event_id
    and membership.active
    and (
      membership.auth_user_id = auth.uid()
      or membership.normalized_email = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  limit 1;
$$;

create function public.has_event_role(
  target_event_id uuid,
  required_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_event_role(target_event_id) = any(required_roles);
$$;

revoke all on function public.current_event_role(uuid) from public;
revoke all on function public.has_event_role(uuid, public.app_role[]) from public;
grant execute on function public.current_event_role(uuid) to authenticated;
grant execute on function public.has_event_role(uuid, public.app_role[]) to authenticated;

alter table public.events enable row level security;
alter table public.event_days enable row level security;
alter table public.event_memberships enable row level security;
alter table public.guests enable row level security;
alter table public.guest_credentials enable row level security;
alter table public.scanner_devices enable row level security;
alter table public.imports enable row level security;
alter table public.daily_attendance enable row level security;
alter table public.scan_events enable row level security;
alter table public.audit_events enable row level security;

create policy "members can read their event"
on public.events for select to authenticated
using (public.current_event_role(id) is not null);

create policy "organizers can update their event"
on public.events for update to authenticated
using (public.has_event_role(id, array['organizer']::public.app_role[]))
with check (public.has_event_role(id, array['organizer']::public.app_role[]));

create policy "members can read event days"
on public.event_days for select to authenticated
using (public.current_event_role(event_id) is not null);

create policy "organizers manage event days"
on public.event_days for all to authenticated
using (public.has_event_role(event_id, array['organizer']::public.app_role[]))
with check (public.has_event_role(event_id, array['organizer']::public.app_role[]));

create policy "staff can read their membership"
on public.event_memberships for select to authenticated
using (
  auth_user_id = auth.uid()
  or normalized_email = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.has_event_role(event_id, array['organizer']::public.app_role[])
);

create policy "organizers manage memberships"
on public.event_memberships for all to authenticated
using (public.has_event_role(event_id, array['organizer']::public.app_role[]))
with check (public.has_event_role(event_id, array['organizer']::public.app_role[]));

create policy "organizers manage guests"
on public.guests for all to authenticated
using (public.has_event_role(event_id, array['organizer']::public.app_role[]))
with check (public.has_event_role(event_id, array['organizer']::public.app_role[]));

create policy "organizers manage credentials"
on public.guest_credentials for all to authenticated
using (
  exists (
    select 1 from public.guests
    where guests.id = guest_credentials.guest_id
      and public.has_event_role(guests.event_id, array['organizer']::public.app_role[])
  )
)
with check (
  exists (
    select 1 from public.guests
    where guests.id = guest_credentials.guest_id
      and public.has_event_role(guests.event_id, array['organizer']::public.app_role[])
  )
);

create policy "staff manage their scanner devices"
on public.scanner_devices for all to authenticated
using (
  auth_user_id = auth.uid()
  and public.has_event_role(event_id, array['organizer', 'scanner']::public.app_role[])
)
with check (
  auth_user_id = auth.uid()
  and public.has_event_role(event_id, array['organizer', 'scanner']::public.app_role[])
);

create policy "organizers manage imports"
on public.imports for all to authenticated
using (public.has_event_role(event_id, array['organizer']::public.app_role[]))
with check (public.has_event_role(event_id, array['organizer']::public.app_role[]));

create policy "organizers and viewers read attendance"
on public.daily_attendance for select to authenticated
using (
  exists (
    select 1
    from public.event_days
    where event_days.id = daily_attendance.event_day_id
      and public.has_event_role(
        event_days.event_id,
        array['organizer', 'viewer']::public.app_role[]
      )
  )
);

create policy "organizers and viewers read scans"
on public.scan_events for select to authenticated
using (
  exists (
    select 1
    from public.event_days
    where event_days.id = scan_events.event_day_id
      and public.has_event_role(
        event_days.event_id,
        array['organizer', 'viewer']::public.app_role[]
      )
  )
);

create policy "organizers read audit events"
on public.audit_events for select to authenticated
using (public.has_event_role(event_id, array['organizer']::public.app_role[]));

insert into public.events (
  id,
  name,
  timezone,
  starts_at,
  ends_at
)
values (
  '3ca63df5-0a3a-452f-a38d-151020260001',
  'Global Tipping Points 2026',
  'Asia/Kuala_Lumpur',
  '2026-10-12 00:00:00+08',
  '2026-10-15 23:59:59+08'
);

insert into public.event_days (event_id, local_date, opens_at, closes_at)
values
  ('3ca63df5-0a3a-452f-a38d-151020260001', '2026-10-12', '2026-10-12 00:00:00+08', '2026-10-12 23:59:59+08'),
  ('3ca63df5-0a3a-452f-a38d-151020260001', '2026-10-13', '2026-10-13 00:00:00+08', '2026-10-13 23:59:59+08'),
  ('3ca63df5-0a3a-452f-a38d-151020260001', '2026-10-14', '2026-10-14 00:00:00+08', '2026-10-14 23:59:59+08'),
  ('3ca63df5-0a3a-452f-a38d-151020260001', '2026-10-15', '2026-10-15 00:00:00+08', '2026-10-15 23:59:59+08');
