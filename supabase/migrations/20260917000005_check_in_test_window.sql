drop function if exists public.record_check_in(uuid, uuid, uuid, text, uuid, text, uuid, timestamptz);

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
  guest_id uuid,
  guest_name text,
  event_day_id uuid,
  event_day_date date,
  outcome public.scan_outcome,
  scan_count integer,
  received_at timestamptz,
  already_processed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest_id uuid;
  v_guest_name text;
  v_event_day_id uuid;
  v_event_day_date date;
  v_device_id uuid;
  v_outcome public.scan_outcome;
  v_scan_count integer;
  v_received_at timestamptz;
begin
  if not exists (
    select 1
    from public.event_memberships
    where id = p_membership_id
      and event_id = p_event_id
      and auth_user_id = p_auth_user_id
      and active = true
      and role in ('organizer', 'scanner')
  ) then
    raise exception 'SCAN_ACCESS_DENIED';
  end if;

  select guests.id, guests.display_name
    into v_guest_id, v_guest_name
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

  select id, local_date
    into v_event_day_id, v_event_day_date
  from public.event_days
  where event_id = p_event_id
    and now() between opens_at and closes_at
  order by local_date
  limit 1;

  if v_event_day_id is null and p_allow_outside_hours then
    select id, local_date
      into v_event_day_id, v_event_day_date
    from public.event_days
    where event_id = p_event_id
    order by local_date
    limit 1;
  end if;

  if v_event_day_id is null then
    raise exception 'EVENT_NOT_ACTIVE';
  end if;

  insert into public.scanner_devices (event_id, auth_user_id, label, last_seen_at)
  values (p_event_id, p_auth_user_id, p_device_label, now())
  on conflict (event_id, auth_user_id, label)
  do update set last_seen_at = now()
  returning id into v_device_id;

  select scan_events.outcome, scan_events.received_at
    into v_outcome, v_received_at
  from public.scan_events
  where device_id = v_device_id
    and client_scan_id = p_client_scan_id;

  if found then
    select daily_attendance.scan_count
      into v_scan_count
    from public.daily_attendance
    where guest_id = v_guest_id
      and event_day_id = v_event_day_id;

    return query
    select v_guest_id, v_guest_name, v_event_day_id, v_event_day_date,
      v_outcome, coalesce(v_scan_count, 1), v_received_at, true;
    return;
  end if;

  if exists (
    select 1
    from public.daily_attendance
    where guest_id = v_guest_id
      and event_day_id = v_event_day_id
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
    outcome
  )
  values (
    v_guest_id,
    v_event_day_id,
    p_membership_id,
    v_device_id,
    p_client_scan_id,
    p_captured_at,
    v_outcome
  )
  returning received_at into v_received_at;

  insert into public.daily_attendance (
    guest_id,
    event_day_id,
    first_scan_at,
    last_scan_at,
    scan_count
  )
  values (v_guest_id, v_event_day_id, v_received_at, v_received_at, 1)
  on conflict (event_day_id, guest_id)
  do update
    set last_scan_at = excluded.last_scan_at,
        scan_count = daily_attendance.scan_count + 1
  returning scan_count into v_scan_count;

  return query
  select v_guest_id, v_guest_name, v_event_day_id, v_event_day_date,
    v_outcome, v_scan_count, v_received_at, false;
end;
$$;

revoke all on function public.record_check_in(uuid, uuid, uuid, text, uuid, text, uuid, timestamptz, boolean) from public;
grant execute on function public.record_check_in(uuid, uuid, uuid, text, uuid, text, uuid, timestamptz, boolean) to service_role;
