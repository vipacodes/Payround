-- PayRound: owner account deletion moves to the seven-day delete queue
-- 2026-08-17
--
-- Behaviour:
--   * When the PayRound owner deletes a user, the account is NOT purged
--     immediately. It enters the same seven-day recovery queue as voluntary
--     deletions, marked deleted_by = 'owner' with the owner's typed reason.
--   * The user app polls get_my_account_deletion_status. An owner-deleted
--     account sees a locked full-screen warning with the reason, a 10-second
--     freeze timer, and a Contact PayRound Support button. If offline, the
--     warning appears at the next login (auth + profile stay intact during
--     the recovery window).
--   * Self-restore stays available ONLY for voluntary ('user') deletions.
--     Owner-deleted accounts can only be restored by the owner (the user is
--     told to contact support within 7 days).
--   * get_owner_users returns deletion_deleted_by and deletion_reason so the
--     owner dashboard can show "Deleted by PayRound" vs "Deleted by user".
--   * After delete_after passes, the existing purge job permanently removes
--     the account exactly as before.
--
-- Safe to run more than once.

begin;

-- -------------------------------------------------------------------------
-- 1. QUEUE COLUMNS: who deleted the account and why
-- -------------------------------------------------------------------------

alter table public.account_deletion_requests
  add column if not exists deleted_by text not null default 'user',
  add column if not exists reason text;

do $$
begin
  alter table public.account_deletion_requests
    add constraint account_deletion_requests_deleted_by_check
    check (deleted_by in ('user', 'owner'));
exception when duplicate_object then null;
end $$;

comment on column public.account_deletion_requests.deleted_by is
  'Who initiated the deletion: ''user'' (voluntary, self-restorable) or ''owner'' (PayRound takedown, owner-restorable only).';
comment on column public.account_deletion_requests.reason is
  'Owner-typed reason shown to the user on the locked deletion warning screen. Null for voluntary deletions.';

-- -------------------------------------------------------------------------
-- 2. OWNER DELETE = QUEUE FOR 7 DAYS (no instant purge while a profile exists)
-- -------------------------------------------------------------------------

create or replace function public.owner_delete_user(
  p_email text,
  p_reason text default 'This account broke PayRound rules.'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  em text;
  why text;
  v_user_id uuid;
  v_name text;
  v_delete_after timestamptz;
begin
  if not public.is_owner() then
    raise exception 'Owner only';
  end if;
  em := lower(trim(coalesce(p_email, '')));
  if em = '' then
    raise exception 'Missing email';
  end if;
  if em in ('vipadarapper@gmail.com', 'payroundsupport@gmail.com') then
    raise exception 'Cannot delete an owner login';
  end if;
  why := nullif(trim(coalesce(p_reason, '')), '');
  if why is null then
    why := 'This account broke PayRound rules.';
  end if;

  select u.id, u.name into v_user_id, v_name
  from public.users u
  where lower(btrim(u.email)) = em
  order by u.created_at nulls last
  limit 1;

  -- No PayRound profile: keep the legacy immediate takedown + purge so
  -- orphaned auth rows can still be removed.
  if v_user_id is null then
    insert into public.account_takedowns (email, reason, taken_down_at, taken_down_by)
    values (em, why, now(), lower(coalesce(auth.jwt()->>'email', '')))
    on conflict (email) do update set
      reason = excluded.reason,
      taken_down_at = now(),
      taken_down_by = excluded.taken_down_by;
    perform public._payround_purge_email(em);
    return jsonb_build_object('ok', true, 'email', em, 'queued', false, 'purged', true);
  end if;

  v_delete_after := clock_timestamp() + interval '7 days';

  insert into public.account_deletion_requests (
    user_id, email, display_name, status, requested_at, delete_after,
    deleted_by, reason,
    restored_at, restored_by, completed_at, last_attempt_at, last_error, updated_at
  )
  values (
    v_user_id, em, v_name, 'pending', clock_timestamp(), v_delete_after,
    'owner', why,
    null, null, null, null, null, clock_timestamp()
  )
  on conflict (user_id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        status = 'pending',
        requested_at = excluded.requested_at,
        delete_after = excluded.delete_after,
        deleted_by = 'owner',
        reason = excluded.reason,
        restored_at = null,
        restored_by = null,
        completed_at = null,
        last_attempt_at = null,
        last_error = null,
        updated_at = clock_timestamp();

  perform public._payround_account_deletion_notice(
    em,
    'account_deleted_by_owner',
    'Your account has been deleted by the PayRound team due to: ' || why ||
      ' The account stays in the PayRound delete queue for 7 days (until ' ||
      to_char(v_delete_after at time zone 'Africa/Lagos', 'FMDay, FMMonth DD, YYYY at HH12:MI AM') ||
      ' West Africa Time). Contact PayRound support before then if you want to recover it. After that it is permanently deleted.'
  );

  return jsonb_build_object(
    'ok', true,
    'email', em,
    'queued', true,
    'deleted_by', 'owner',
    'reason', why,
    'delete_after', v_delete_after
  );
end;
$function$;

-- -------------------------------------------------------------------------
-- 3. STATUS RPC: the user app needs who deleted the account and the reason
-- -------------------------------------------------------------------------

create or replace function public.get_my_account_deletion_status()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_user_id uuid := public.resolve_authenticated_profile_id();
  v_request public.account_deletion_requests%rowtype;
begin
  if auth.uid() is null or v_user_id is null then
    raise exception 'Authenticated PayRound profile required' using errcode = '42501';
  end if;

  select r.* into v_request
  from public.account_deletion_requests r
  where r.user_id = v_user_id
    and r.status = 'pending';

  if not found then
    return jsonb_build_object('ok', true, 'queued', false, 'can_restore', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'queued', true,
    'status', v_request.status,
    'deleted_by', coalesce(v_request.deleted_by, 'user'),
    'reason', v_request.reason,
    'requested_at', v_request.requested_at,
    'delete_after', v_request.delete_after,
    -- Self-restore is only for voluntary deletions. Owner takedowns are
    -- recovered by contacting PayRound support (owner restores from dashboard).
    'can_restore', v_request.delete_after > clock_timestamp()
      and coalesce(v_request.deleted_by, 'user') = 'user',
    'remaining_seconds', greatest(0, floor(extract(epoch from (v_request.delete_after - clock_timestamp())))::bigint)
  );
end;
$function$;

-- -------------------------------------------------------------------------
-- 4. SELF-RESTORE: refuse owner takedowns
-- -------------------------------------------------------------------------

create or replace function public.restore_my_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_user_id uuid := public.resolve_authenticated_profile_id();
  v_email text;
  v_request public.account_deletion_requests%rowtype;
begin
  if auth.uid() is null or v_user_id is null then
    raise exception 'Authenticated PayRound profile required' using errcode = '42501';
  end if;

  update public.account_deletion_requests r
     set status = 'restored',
         restored_at = clock_timestamp(),
         restored_by = 'user',
         last_error = null,
         updated_at = clock_timestamp()
   where r.user_id = v_user_id
     and r.status = 'pending'
     and coalesce(r.deleted_by, 'user') = 'user'
     and r.delete_after > clock_timestamp()
  returning * into v_request;

  if not found then
    if exists (
      select 1 from public.account_deletion_requests r
      where r.user_id = v_user_id
        and r.status = 'pending'
        and coalesce(r.deleted_by, 'user') = 'owner'
    ) then
      raise exception 'This account was deleted by the PayRound team. Contact PayRound support within the 7-day recovery period to request restoration.' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.account_deletion_requests r
      where r.user_id = v_user_id
        and r.status = 'pending'
        and r.delete_after <= clock_timestamp()
    ) then
      raise exception 'The seven-day recovery period has expired' using errcode = '55000';
    end if;
    return jsonb_build_object('ok', true, 'restored', false, 'already_active', true);
  end if;

  select lower(btrim(u.email)) into v_email
  from public.users u
  where u.id = v_user_id;

  perform public._payround_account_deletion_notice(
    coalesce(v_email, v_request.email),
    'account_deletion_restored',
    'Your scheduled account deletion was cancelled. Your PayRound account and data remain active.'
  );

  return jsonb_build_object(
    'ok', true,
    'restored', true,
    'restored_at', v_request.restored_at
  );
end;
$function$;

-- -------------------------------------------------------------------------
-- 5. OWNER USERS LIST: expose who deleted each queued account and the reason
-- -------------------------------------------------------------------------

create or replace function public.get_owner_users()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.payround_is_owner() then
    raise exception 'PayRound owner access required' using errcode = '42501';
  end if;

  -- Safe fallback if pg_cron is ever paused: an authenticated owner refresh
  -- processes already-expired requests before returning the Users list.
  perform public.purge_expired_account_deletions();

  select coalesce(jsonb_agg(
    (
      to_jsonb(u) - array['password_hash', 'reset_code', 'reset_expires']::text[]
    ) || jsonb_build_object(
      'deletion_status', r.status,
      'deletion_requested_at', r.requested_at,
      'deletion_scheduled_for', r.delete_after,
      'deletion_deleted_by', case when r.user_id is null then null else coalesce(r.deleted_by, 'user') end,
      'deletion_reason', r.reason,
      'deletion_can_restore', case
        when r.status = 'pending' then r.delete_after > clock_timestamp()
        else false
      end
    )
    order by u.created_at desc
  ), '[]'::jsonb) into v_result
  from public.users u
  left join public.account_deletion_requests r
    on r.user_id = u.id
   and r.status = 'pending';

  return v_result;
end;
$function$;

-- -------------------------------------------------------------------------
-- 6. OWNER RESTORE: notice text reflects who queued the deletion
-- -------------------------------------------------------------------------

create or replace function public.owner_restore_account_deletion(p_user_id uuid)
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

  update public.account_deletion_requests r
     set status = 'restored',
         restored_at = clock_timestamp(),
         restored_by = coalesce(public.payround_actor_email(), 'payround-owner'),
         last_error = null,
         updated_at = clock_timestamp()
   where r.user_id = p_user_id
     and r.status = 'pending'
     and r.delete_after > clock_timestamp()
  returning * into v_request;

  if not found then
    if exists (
      select 1 from public.account_deletion_requests r
      where r.user_id = p_user_id
        and r.status = 'pending'
        and r.delete_after <= clock_timestamp()
    ) then
      raise exception 'The seven-day recovery period has expired' using errcode = '55000';
    end if;
    return jsonb_build_object('ok', true, 'restored', false, 'already_active', true);
  end if;

  perform public._payround_account_deletion_notice(
    v_request.email,
    'account_deletion_restored_by_owner',
    case when coalesce(v_request.deleted_by, 'user') = 'owner'
      then 'The PayRound team restored your account. The deletion of your account was cancelled during its seven-day recovery period and all of your data remains active.'
      else 'The PayRound owner restored your account during its seven-day recovery period. Your scheduled deletion was cancelled and your data remains active.'
    end
  );

  return jsonb_build_object(
    'ok', true,
    'restored', true,
    'restored_at', v_request.restored_at,
    'restored_by', v_request.restored_by
  );
end;
$function$;

commit;
