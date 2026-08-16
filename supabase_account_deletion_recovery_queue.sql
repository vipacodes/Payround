-- PayRound seven-day self-service account-deletion queue
-- 2026-08-16
--
-- Ordered rollout:
--   1. Private queue table and indexes.
--   2. Authenticated request/status/restore RPCs and owner restore RPC.
--   3. Complete, transactional permanent purge after the recovery deadline.
--   4. Owner Users RPC deletion metadata.
--   5. Protected pg_cron schedule plus owner-list refresh fallback.
--
-- The queue is never exposed as a directly readable/writable client table.
-- A queued account keeps all of its profile and group data during the exact
-- seven-day recovery period. Permanent purge starts only when delete_after
-- has passed. Each purge runs in a per-account subtransaction so a failure
-- cannot leave that account partially deleted.

begin;

-- -------------------------------------------------------------------------
-- 1. PRIVATE QUEUE
-- -------------------------------------------------------------------------

create table if not exists public.account_deletion_requests (
  user_id uuid primary key,
  email text not null,
  display_name text,
  status text not null default 'pending'
    check (status in ('pending', 'restored', 'completed')),
  requested_at timestamptz not null default clock_timestamp(),
  delete_after timestamptz not null,
  restored_at timestamptz,
  restored_by text,
  completed_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists account_deletion_requests_due_idx
  on public.account_deletion_requests (delete_after)
  where status = 'pending';

create index if not exists account_deletion_requests_email_idx
  on public.account_deletion_requests (lower(email));

alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_requests force row level security;
revoke all on table public.account_deletion_requests from public, anon, authenticated;
grant all on table public.account_deletion_requests to service_role;

comment on table public.account_deletion_requests is
  'Private seven-day voluntary account-deletion queue. Client access is only through authenticated SECURITY DEFINER RPCs.';
comment on column public.account_deletion_requests.delete_after is
  'Exact end of the recovery window. Restore RPCs refuse recovery at or after this instant.';

-- Internal private-notification helper. Its caller supplies an email that was
-- resolved from the authenticated profile or an owner-authorized queue row.
create or replace function public._payround_account_deletion_notice(
  p_email text,
  p_type text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_email text := nullif(lower(btrim(p_email)), '');
begin
  if v_email is null then
    return;
  end if;

  insert into public.notifications (id, type, group_id, message, is_read, created_at, user_email)
  values (
    p_type || '-' || gen_random_uuid()::text,
    p_type,
    null,
    p_message,
    false,
    clock_timestamp(),
    v_email
  );
end;
$function$;

revoke all on function public._payround_account_deletion_notice(text, text, text) from public, anon, authenticated;
grant execute on function public._payround_account_deletion_notice(text, text, text) to service_role;

-- -------------------------------------------------------------------------
-- 2. AUTHENTICATED REQUEST, STATUS AND RECOVERY RPCS
-- -------------------------------------------------------------------------

create or replace function public.request_my_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_id uuid := public.resolve_authenticated_profile_id();
  v_email text;
  v_name text;
  v_request public.account_deletion_requests%rowtype;
begin
  if auth.uid() is null or v_user_id is null then
    raise exception 'Authenticated PayRound profile required' using errcode = '42501';
  end if;

  select lower(btrim(u.email)), u.name
    into v_email, v_name
  from public.users u
  where u.id = v_user_id;

  if v_email is null then
    raise exception 'Authenticated PayRound profile required' using errcode = '42501';
  end if;

  if v_email in (
    'payround1@gmail.com',
    'payround2@gmail.com',
    'payroundsupport@gmail.com',
    'vipadarapper@gmail.com'
  ) then
    raise exception 'PayRound owner accounts cannot be self-deleted' using errcode = '42501';
  end if;

  -- Repeated taps must never extend an existing seven-day deadline.
  select r.* into v_request
  from public.account_deletion_requests r
  where r.user_id = v_user_id
    and r.status = 'pending'
  for update;

  if found then
    return jsonb_build_object(
      'ok', true,
      'queued', true,
      'already_queued', true,
      'requested_at', v_request.requested_at,
      'delete_after', v_request.delete_after,
      'can_restore', v_request.delete_after > clock_timestamp()
    );
  end if;

  insert into public.account_deletion_requests (
    user_id, email, display_name, status, requested_at, delete_after,
    restored_at, restored_by, completed_at, last_attempt_at, last_error, updated_at
  )
  values (
    v_user_id, v_email, v_name, 'pending', clock_timestamp(),
    clock_timestamp() + interval '7 days',
    null, null, null, null, null, clock_timestamp()
  )
  on conflict (user_id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        status = 'pending',
        requested_at = excluded.requested_at,
        delete_after = excluded.delete_after,
        restored_at = null,
        restored_by = null,
        completed_at = null,
        last_attempt_at = null,
        last_error = null,
        updated_at = excluded.updated_at
  returning * into v_request;

  perform public._payround_account_deletion_notice(
    v_email,
    'account_deletion_queued',
    'Your account deletion is scheduled for ' ||
      to_char(v_request.delete_after at time zone 'Africa/Lagos', 'FMDay, FMMonth DD, YYYY at HH12:MI AM') ||
      ' (West Africa Time). You or the PayRound owner can restore the account before then. After the seven-day recovery period, the account and its data will be permanently deleted.'
  );

  return jsonb_build_object(
    'ok', true,
    'queued', true,
    'already_queued', false,
    'requested_at', v_request.requested_at,
    'delete_after', v_request.delete_after,
    'can_restore', true
  );
end;
$function$;

-- Keep the old RPC name safe for already-loaded clients. It now schedules the
-- same seven-day queue instead of immediately calling the purge helper.
create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  return public.request_my_account_deletion();
end;
$function$;

create or replace function public.get_my_account_deletion_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
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
    'requested_at', v_request.requested_at,
    'delete_after', v_request.delete_after,
    'can_restore', v_request.delete_after > clock_timestamp(),
    'remaining_seconds', greatest(0, floor(extract(epoch from (v_request.delete_after - clock_timestamp())))::bigint)
  );
end;
$function$;

create or replace function public.restore_my_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
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
     and r.delete_after > clock_timestamp()
  returning * into v_request;

  if not found then
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

create or replace function public.owner_restore_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
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
    'The PayRound owner restored your account during its seven-day recovery period. Your scheduled deletion was cancelled and your data remains active.'
  );

  return jsonb_build_object(
    'ok', true,
    'restored', true,
    'restored_at', v_request.restored_at,
    'restored_by', v_request.restored_by
  );
end;
$function$;

revoke all on function public.request_my_account_deletion() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.get_my_account_deletion_status() from public, anon;
revoke all on function public.restore_my_account_deletion() from public, anon;
revoke all on function public.owner_restore_account_deletion(uuid) from public, anon;
grant execute on function public.request_my_account_deletion() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.get_my_account_deletion_status() to authenticated;
grant execute on function public.restore_my_account_deletion() to authenticated;
grant execute on function public.owner_restore_account_deletion(uuid) to authenticated;
grant execute on function public.request_my_account_deletion() to service_role;
grant execute on function public.delete_my_account() to service_role;
grant execute on function public.get_my_account_deletion_status() to service_role;
grant execute on function public.restore_my_account_deletion() to service_role;
grant execute on function public.owner_restore_account_deletion(uuid) to service_role;

-- -------------------------------------------------------------------------
-- 3. COMPLETE PERMANENT PURGE AND PROTECTED EXPIRY PROCESSOR
-- -------------------------------------------------------------------------

-- This preserves the established group/payment deletion order while covering
-- identity-bearing tables added after the original helper was written.
create or replace function public._payround_purge_email(em text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_id uuid;
  v_anonymous_email text;
begin
  em := lower(btrim(em));
  if em is null or em = '' then
    return;
  end if;

  select u.id into v_user_id
  from public.users u
  where lower(btrim(u.email)) = em
  order by u.created_at nulls last
  limit 1;

  v_anonymous_email := case
    when v_user_id is null then 'deleted-account@payround.invalid'
    else 'deleted-' || replace(v_user_id::text, '-', '') || '@payround.invalid'
  end;

  -- Groups administered by the account. Foreign-key cascades also remove
  -- cycle archives, archive children, reviews, and receipt rows for the group.
  delete from public.group_messages where group_id in (select id from public.groups where lower(btrim(admin_email)) = em);
  delete from public.payments where group_id in (select id from public.groups where lower(btrim(admin_email)) = em);
  delete from public.payouts where group_id in (select id from public.groups where lower(btrim(admin_email)) = em);
  delete from public.members where group_id in (select id from public.groups where lower(btrim(admin_email)) = em);
  delete from public.member_receipts where group_id in (select id from public.groups where lower(btrim(admin_email)) = em);
  delete from public.group_reviews where group_id in (select id from public.groups where lower(btrim(admin_email)) = em);
  delete from public.group_edit_requests where group_id in (select id from public.groups where lower(btrim(admin_email)) = em);
  delete from public.notifications where group_id in (select id from public.groups where lower(btrim(admin_email)) = em);
  delete from public.verification_requests where group_id in (select id from public.groups where lower(btrim(admin_email)) = em);
  delete from public.groups where lower(btrim(admin_email)) = em;

  -- Current account-owned/member data.
  delete from public.members where lower(btrim(member_email)) = em;
  delete from public.member_receipts where lower(btrim(member_email)) = em;
  delete from public.payments where lower(btrim(user_email)) = em;
  delete from public.payouts where lower(btrim(user_email)) = em;
  delete from public.messages where lower(btrim(from_email)) = em or lower(btrim(to_email)) = em;
  delete from public.group_messages where lower(btrim(from_email)) = em;
  delete from public.notifications where lower(btrim(user_email)) = em;
  delete from public.group_reviews where lower(btrim(reviewer_email)) = em;
  delete from public.member_reviews where lower(btrim(member_email)) = em or lower(btrim(admin_email)) = em;
  delete from public.group_edit_requests where lower(btrim(admin_email)) = em;
  delete from public.verification_requests where lower(btrim(user_email)) = em or lower(btrim(admin_email)) = em;
  delete from public.follows
    where lower(btrim(follower_email)) = em
       or lower(btrim(following_email)) = em
       or (v_user_id is not null and following_id = v_user_id::text);
  delete from public.ads where lower(btrim(submitter_email)) = em;
  delete from public.business_reviews where lower(btrim(reviewer)) = em;
  delete from public.support_messages where thread_id in (select id from public.support_threads where lower(btrim(user_email)) = em);
  delete from public.support_threads where lower(btrim(user_email)) = em;

  -- Private/read-model rows that identify the profile by UUID.
  if v_user_id is not null then
    delete from public.notification_user_state where user_id = v_user_id;

    -- public_members is a read-only view over members + users, so the member
    -- and profile deletions above remove it from that view automatically.

    -- Keep the financial payout ledger but remove the deleted person's direct
    -- identity. The users FK is SET NULL; doing it here makes the intent clear.
    update public.referral_payouts
       set user_id = null,
           user_email = v_anonymous_email,
           user_name = 'Deleted account'
     where user_id = v_user_id or lower(btrim(user_email)) = em;
  else
    update public.referral_payouts
       set user_email = v_anonymous_email,
           user_name = 'Deleted account'
     where lower(btrim(user_email)) = em;
  end if;

  -- Archived cycles can contain to_jsonb snapshots from before rollover.
  delete from public.group_cycle_member_archive
   where lower(btrim(row_data ->> 'member_email')) = em;
  delete from public.group_cycle_payment_archive
   where lower(btrim(row_data ->> 'user_email')) = em;
  delete from public.group_cycle_payout_archive
   where lower(btrim(row_data ->> 'user_email')) = em;
  delete from public.group_cycle_receipt_message_archive
   where lower(btrim(row_data ->> 'from_email')) = em;

  delete from public.users where lower(btrim(email)) = em;
  delete from auth.users where lower(btrim(email)) = em;

  -- Owner takedowns can also purge a voluntarily queued account. Marking the
  -- queue complete prevents a later scheduler retry against an absent profile.
  update public.account_deletion_requests
     set status = 'completed',
         completed_at = coalesce(completed_at, clock_timestamp()),
         last_error = null,
         updated_at = clock_timestamp()
   where lower(btrim(email)) = em
     and status = 'pending';
end;
$function$;

revoke all on function public._payround_purge_email(text) from public, anon, authenticated;
grant execute on function public._payround_purge_email(text) to service_role;

create or replace function public.purge_expired_account_deletions()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_request public.account_deletion_requests%rowtype;
  v_purged integer := 0;
begin
  for v_request in
    select r.*
    from public.account_deletion_requests r
    where r.status = 'pending'
      and r.delete_after <= clock_timestamp()
    order by r.delete_after
    for update skip locked
  loop
    begin
      update public.account_deletion_requests
         set last_attempt_at = clock_timestamp(),
             last_error = null,
             updated_at = clock_timestamp()
       where user_id = v_request.user_id;

      perform public._payround_purge_email(v_request.email);

      update public.account_deletion_requests
         set status = 'completed',
             completed_at = coalesce(completed_at, clock_timestamp()),
             last_error = null,
             updated_at = clock_timestamp()
       where user_id = v_request.user_id;

      v_purged := v_purged + 1;
    exception when others then
      -- This inner block is a subtransaction: any partial account purge is
      -- rolled back before the private operational error is recorded.
      update public.account_deletion_requests
         set last_attempt_at = clock_timestamp(),
             last_error = left(sqlstate || ': ' || sqlerrm, 1000),
             updated_at = clock_timestamp()
       where user_id = v_request.user_id;
    end;
  end loop;

  return v_purged;
end;
$function$;

revoke all on function public.purge_expired_account_deletions() from public, anon, authenticated;
grant execute on function public.purge_expired_account_deletions() to service_role;

-- -------------------------------------------------------------------------
-- 4. OWNER USERS DATA WITH PRIVATE QUEUE METADATA
-- -------------------------------------------------------------------------

create or replace function public.get_owner_users()
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
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

revoke all on function public.get_owner_users() from public, anon;
grant execute on function public.get_owner_users() to authenticated, service_role;

-- -------------------------------------------------------------------------
-- 5. DATABASE SCHEDULER
-- -------------------------------------------------------------------------

-- Supabase supports pg_cron in pg_catalog. The job runs in the database as a
-- protected role and calls only the non-client expiry processor above.
create extension if not exists pg_cron with schema pg_catalog;

do $schedule$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job
    where jobname = 'payround-purge-expired-account-deletions'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'payround-purge-expired-account-deletions',
    '*/10 * * * *',
    'select public.purge_expired_account_deletions();'
  );
end;
$schedule$;

commit;
