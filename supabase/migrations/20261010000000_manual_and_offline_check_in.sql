create type public.scan_method as enum ('qr', 'manual', 'import');

alter table public.scan_events
  add column method public.scan_method not null default 'qr';

-- Shared check-in write used by QR scans, desk search, and roster upload.
-- Event day resolution:
--   1. an explicit date that is today or earlier (test mode may use a future event day)
--   2. the event day containing captured_at, when that time is within the last 72 hours
--      and no more than 5 minutes ahead of the server
--   3. the event day containing now()
--   4. the earliest event day when test mode allows check-in outside the schedule
create function public.record_guest_attendance(
  p_event_id uuid,
  p_membership_id uuid,
  p_auth_user_id uuid,
  p_device_label text,
  p_guest_id uuid,
  p_client_scan_id uuid,
  p_method public.scan_method,
  p_event_day_date date default null,
  p_captured_at timestamptz default null,
  p_allow_outside_hours boolean default false
)
returns table (
  out_guest_id uuid,
  out_guest_name text,
  out_event_day_id uuid,
  out_event_day_date date,
  out_outcome public.scan_outcome,
  out_scan_count integer,
  out_received_at timestamptz,
  out_already_processed boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_guest_id uuid;
  v_guest_name text;
  v_event_day_id uuid;
  v_event_day_date date;
  v_device_id uuid;
  v_outcome public.scan_outcome;
  v_scan_count integer;
  v_received_at timestamptz;
  v_attendance_at timestamptz;
begin
  if not exists (
    select 1
    from public.event_memberships
    where event_memberships.id = p_membership_id
      and event_memberships.event_id = p_event_id
      and event_memberships.auth_user_id = p_auth_user_id
      and event_memberships.active = true
      and event_memberships.role in ('organizer', 'scanner')
  ) then
    raise exception 'SCAN_ACCESS_DENIED';
  end if;

  select guests.id, guests.display_name
    into v_guest_id, v_guest_name
  from public.guests
  where guests.id = p_guest_id
    and guests.event_id = p_event_id
    and guests.status = 'active';

  if v_guest_id is null then
    raise exception 'GUEST_NOT_ACTIVE';
  end if;

  if p_event_day_date is not null then
    if p_event_day_date > (now() at time zone 'Asia/Kuala_Lumpur')::date
       and not p_allow_outside_hours then
      raise exception 'EVENT_DAY_IN_FUTURE';
    end if;

    select event_days.id, event_days.local_date
      into v_event_day_id, v_event_day_date
    from public.event_days
    where event_days.event_id = p_event_id
      and event_days.local_date = p_event_day_date;

    if v_event_day_id is null then
      raise exception 'EVENT_DAY_NOT_FOUND';
    end if;
  else
    if p_captured_at is not null
       and p_captured_at >= now() - interval '72 hours'
       and p_captured_at <= now() + interval '5 minutes' then
      select event_days.id, event_days.local_date
        into v_event_day_id, v_event_day_date
      from public.event_days
      where event_days.event_id = p_event_id
        and p_captured_at between event_days.opens_at and event_days.closes_at
      order by event_days.local_date
      limit 1;
    end if;

    if v_event_day_id is null then
      select event_days.id, event_days.local_date
        into v_event_day_id, v_event_day_date
      from public.event_days
      where event_days.event_id = p_event_id
        and now() between event_days.opens_at and event_days.closes_at
      order by event_days.local_date
      limit 1;
    end if;

    if v_event_day_id is null and p_allow_outside_hours then
      select event_days.id, event_days.local_date
        into v_event_day_id, v_event_day_date
      from public.event_days
      where event_days.event_id = p_event_id
      order by event_days.local_date
      limit 1;
    end if;

    if v_event_day_id is null then
      raise exception 'EVENT_NOT_ACTIVE';
    end if;
  end if;

  insert into public.scanner_devices (event_id, auth_user_id, label, last_seen_at)
  values (p_event_id, p_auth_user_id, p_device_label, now())
  on conflict (event_id, auth_user_id, label)
  do update set last_seen_at = now()
  returning scanner_devices.id into v_device_id;

  select scan_events.outcome, scan_events.received_at
    into v_outcome, v_received_at
  from public.scan_events
  where scan_events.device_id = v_device_id
    and scan_events.client_scan_id = p_client_scan_id;

  if found then
    select daily_attendance.scan_count
      into v_scan_count
    from public.daily_attendance
    where daily_attendance.guest_id = v_guest_id
      and daily_attendance.event_day_id = v_event_day_id;

    return query
    select
      v_guest_id,
      v_guest_name,
      v_event_day_id,
      v_event_day_date,
      v_outcome,
      coalesce(v_scan_count, 1),
      v_received_at,
      true;
    return;
  end if;

  if p_method = 'import' then
    perform pg_advisory_xact_lock(hashtext(v_guest_id::text), hashtext(v_event_day_id::text));

    select daily_attendance.scan_count, daily_attendance.first_scan_at
      into v_scan_count, v_received_at
    from public.daily_attendance
    where daily_attendance.guest_id = v_guest_id
      and daily_attendance.event_day_id = v_event_day_id;

    if found then
      return query
      select
        v_guest_id,
        v_guest_name,
        v_event_day_id,
        v_event_day_date,
        'valid_repeat'::public.scan_outcome,
        coalesce(v_scan_count, 1),
        v_received_at,
        true;
      return;
    end if;
  end if;

  if exists (
    select 1
    from public.daily_attendance
    where daily_attendance.guest_id = v_guest_id
      and daily_attendance.event_day_id = v_event_day_id
  ) then
    v_outcome := 'valid_repeat';
  else
    v_outcome := 'valid_first';
  end if;

  insert into public.scan_events (
    guest_id,
    event_day_id,
    membership_id,
    device_id,
    client_scan_id,
    captured_at,
    outcome,
    method
  )
  values (
    v_guest_id,
    v_event_day_id,
    p_membership_id,
    v_device_id,
    p_client_scan_id,
    p_captured_at,
    v_outcome,
    p_method
  )
  returning scan_events.received_at into v_received_at;

  v_attendance_at := least(coalesce(p_captured_at, v_received_at), v_received_at);

  insert into public.daily_attendance (
    guest_id,
    event_day_id,
    first_scan_at,
    last_scan_at,
    scan_count
  )
  values (v_guest_id, v_event_day_id, v_attendance_at, v_attendance_at, 1)
  on conflict on constraint daily_attendance_event_day_id_guest_id_key
  do update
    set first_scan_at = least(daily_attendance.first_scan_at, excluded.first_scan_at),
        last_scan_at = greatest(daily_attendance.last_scan_at, excluded.last_scan_at),
        scan_count = daily_attendance.scan_count + 1
  returning daily_attendance.scan_count into v_scan_count;

  return query
  select
    v_guest_id,
    v_guest_name,
    v_event_day_id,
    v_event_day_date,
    v_outcome,
    v_scan_count,
    v_received_at,
    false;
end;
$$;

drop function if exists public.record_check_in(uuid, uuid, uuid, text, uuid, text, uuid, timestamptz, boolean);

create function public.record_check_in(
  p_event_id uuid,
  p_membership_id uuid,
  p_auth_user_id uuid,
  p_device_label text,
  p_public_id uuid,
  p_token_digest text,
  p_client_scan_id uuid,
  p_captured_at timestamptz default null,
  p_allow_outside_hours boolean default false
)
returns table (
  out_guest_id uuid,
  out_guest_name text,
  out_event_day_id uuid,
  out_event_day_date date,
  out_outcome public.scan_outcome,
  out_scan_count integer,
  out_received_at timestamptz,
  out_already_processed boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_guest_id uuid;
begin
  if not exists (
    select 1
    from public.event_memberships
    where event_memberships.id = p_membership_id
      and event_memberships.event_id = p_event_id
      and event_memberships.auth_user_id = p_auth_user_id
      and event_memberships.active = true
      and event_memberships.role in ('organizer', 'scanner')
  ) then
    raise exception 'SCAN_ACCESS_DENIED';
  end if;

  select guests.id
    into v_guest_id
  from public.guest_credentials
  join public.guests on guests.id = guest_credentials.guest_id
  where guest_credentials.public_id = p_public_id
    and guest_credentials.token_digest = p_token_digest
    and guest_credentials.revoked_at is null
    and guests.event_id = p_event_id
    and guests.status = 'active';

  if v_guest_id is null then
    raise exception 'PASS_INVALID_OR_REVOKED';
  end if;

  return query
  select *
  from public.record_guest_attendance(
    p_event_id,
    p_membership_id,
    p_auth_user_id,
    p_device_label,
    v_guest_id,
    p_client_scan_id,
    'qr'::public.scan_method,
    null::date,
    p_captured_at,
    p_allow_outside_hours
  );
end;
$$;

revoke all on function public.record_guest_attendance(uuid, uuid, uuid, text, uuid, uuid, public.scan_method, date, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.record_guest_attendance(uuid, uuid, uuid, text, uuid, uuid, public.scan_method, date, timestamptz, boolean) to service_role;

revoke all on function public.record_check_in(uuid, uuid, uuid, text, uuid, text, uuid, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.record_check_in(uuid, uuid, uuid, text, uuid, text, uuid, timestamptz, boolean) to service_role;
