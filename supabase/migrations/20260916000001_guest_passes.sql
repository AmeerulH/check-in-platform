alter table public.guest_credentials
  add column public_id uuid not null default gen_random_uuid() unique;

create function public.issue_guest_credential(
  target_guest_id uuid,
  next_token_digest text
)
returns table (
  credential_id uuid,
  public_id uuid,
  version integer
)
language plpgsql
set search_path = public
as $$
declare
  next_version integer;
begin
  select coalesce(max(guest_credentials.version), 0) + 1
    into next_version
    from public.guest_credentials
   where guest_credentials.guest_id = target_guest_id;

  update public.guest_credentials
     set revoked_at = now()
   where guest_id = target_guest_id
     and revoked_at is null;

  return query
  insert into public.guest_credentials (guest_id, token_digest, version)
  values (target_guest_id, next_token_digest, next_version)
  returning id, guest_credentials.public_id, guest_credentials.version;
end;
$$;

revoke all on function public.issue_guest_credential(uuid, text) from public;
