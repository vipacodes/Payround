-- PayRound: owner can permanently delete a queued account immediately
-- 2026-08-21
--
-- Adds owner_purge_queued_account(p_user_id): skips the rest of the 7-day
-- recovery window for an account that is already in the deletion queue
-- (whether queued by the user or by the owner) and runs the exact same
-- transactional purge the scheduler would run at the deadline. The queue
-- row is marked completed so the scheduler never retries it.
--
-- Safe to run more than once.

begin;

create or replace function public.owner_purge_queued_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_request public.account_deletion_requests%rowtype;
begin
  if auth.uid() is null or not public.payround_is_owner() then
    raise exception 'PayRound owner access required' using errcode = '42501';
  end if;

  select r.* into v_request
  from public.account_deletion_requests r
  where r.user_id = p_user_id
    and r.status = 'pending'
  for update;

  if not found then
    raise exception 'This account is not in the deletion queue' using errcode = 'P0002';
  end if;

  if lower(btrim(v_request.email)) in ('vipadarapper@gmail.com', 'payroundsupport@gmail.com') then
    raise exception 'Owner logins cannot be purged' using errcode = '42501';
  end if;

  update public.account_deletion_requests
     set last_attempt_at = clock_timestamp(),
         last_error = null,
         updated_at = clock_timestamp()
   where user_id = v_request.user_id;

  -- Same complete purge the scheduler runs after the deadline. It also marks
  -- this queue row completed, so no later retry can target the absent profile.
  perform public._payround_purge_email(v_request.email);

  update public.account_deletion_requests
     set status = 'completed',
         completed_at = coalesce(completed_at, clock_timestamp()),
         last_error = null,
         updated_at = clock_timestamp()
   where user_id = v_request.user_id;

  return jsonb_build_object(
    'ok', true,
    'purged', true,
    'email', v_request.email,
    'was_deleted_by', coalesce(v_request.deleted_by, 'user')
  );
end;
$function$;

revoke all on function public.owner_purge_queued_account(uuid) from public, anon;
grant execute on function public.owner_purge_queued_account(uuid) to authenticated, service_role;

commit;
