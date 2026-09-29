create or replace function public.apply_guest_source_change(target_change_id uuid, reviewer_id uuid)
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
    normalized_email = source_change.proposed->>'normalized_email',
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
