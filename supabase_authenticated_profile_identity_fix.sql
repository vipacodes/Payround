-- PayRound authenticated profile identity correction
-- Fixes legacy accounts whose auth.users.id differs from public.users.id.
-- Safe identity order: exact auth UUID first, then one normalized authoritative auth email match.
-- This migration is atomic and preserves referral qualification/reward state.

begin;

-- Resolve the app profile belonging to the authenticated Supabase account. Newer
-- profiles use auth.uid() directly; one legacy signup path allowed public.users to
-- receive a different generated UUID, so that account is safely matched through the
-- authoritative email in auth.users instead. Clients cannot supply either identity.
create or replace function public.resolve_authenticated_profile_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_auth_id uuid := auth.uid();
  v_profile_id uuid;
  v_email_matches integer := 0;
begin
  if v_auth_id is null then
    return null;
  end if;

  select u.id into v_profile_id
  from public.users as u
  where u.id = v_auth_id;

  if v_profile_id is not null then
    return v_profile_id;
  end if;

  select count(*), min(u.id::text)::uuid
    into v_email_matches, v_profile_id
  from auth.users as a
  join public.users as u
    on lower(btrim(u.email)) = lower(btrim(a.email))
  where a.id = v_auth_id
    and nullif(btrim(a.email), '') is not null;

  if v_email_matches = 1 then
    return v_profile_id;
  end if;

  -- Missing or ambiguous normalized emails must never select an arbitrary profile.
  return null;
end;
$function$;

revoke all on function public.resolve_authenticated_profile_id() from public, anon, authenticated;

-- Authenticated, identity-bound referral recording. No money moves at signup.
drop function if exists public.apply_referral(text, text);

create function public.apply_referral(p_new_email text, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_auth_id uuid := auth.uid();
  v_profile_id uuid;
  v_new_email text;
  v_new_name text;
  v_ref_id uuid;
  v_ref_email text;
  v_ref_matches integer := 0;
  v_existing_status text;
begin
  if v_auth_id is null then
    return jsonb_build_object('ok', false, 'why', 'not_authenticated');
  end if;

  v_profile_id := public.resolve_authenticated_profile_id();
  if v_profile_id is null then
    return jsonb_build_object('ok', false, 'why', 'profile_not_found');
  end if;

  if nullif(btrim(p_new_email), '') is null or nullif(btrim(p_ref), '') is null then
    return jsonb_build_object('ok', false, 'why', 'missing');
  end if;

  select lower(btrim(u.email)), coalesce(nullif(btrim(u.name), ''), 'A new member')
    into v_new_email, v_new_name
  from public.users as u
  where u.id = v_profile_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'why', 'profile_not_found');
  end if;

  if v_new_email <> lower(btrim(p_new_email)) then
    return jsonb_build_object('ok', false, 'why', 'identity_mismatch');
  end if;

  select c.status into v_existing_status
  from public.referral_claims as c
  where c.referred_user_id = v_profile_id;

  if found then
    return jsonb_build_object(
      'ok', true,
      'why', 'already_recorded',
      'status', v_existing_status,
      'amount', 0
    );
  end if;

  select count(*), min(u.id::text)::uuid
    into v_ref_matches, v_ref_id
  from public.users as u
  where lower(u.id::text) = lower(btrim(p_ref))
     or (
       length(btrim(p_ref)) = 8
       and left(lower(u.id::text), 8) = lower(btrim(p_ref))
     );

  if v_ref_matches = 0 then
    return jsonb_build_object('ok', false, 'why', 'no_referrer');
  end if;
  if v_ref_matches <> 1 then
    return jsonb_build_object('ok', false, 'why', 'ambiguous_referrer');
  end if;
  if v_ref_id = v_profile_id then
    return jsonb_build_object('ok', false, 'why', 'self_referral');
  end if;

  select lower(btrim(u.email)) into v_ref_email
  from public.users as u
  where u.id = v_ref_id
  for update;

  update public.users
  set referred_by = v_ref_id::text
  where id = v_profile_id;

  insert into public.referral_claims (
    referred_user_id, referrer_user_id, bonus_amount, status
  ) values (
    v_profile_id, v_ref_id, 0, 'referred'
  );

  begin
    insert into public.notifications (id, type, user_email, message, is_read)
    values (
      'ref-recorded-' || v_profile_id::text,
      'referral_recorded',
      v_ref_email,
      '👋 ' || v_new_name || ' joined with your referral link. No signup bonus is paid; you can earn ₦500 once PayRound approves their first group and you meet the group eligibility rule.',
      false
    )
    on conflict (id) do nothing;
  exception when others then
    null;
  end;

  -- Deliberately do not inspect already-approved groups here. Qualification comes
  -- only from a future PayRound approval transition, which is the hard boundary that
  -- prevents this migration from creating retroactive N500 awards.
  return jsonb_build_object(
    'ok', true,
    'why', 'recorded',
    'status', 'referred',
    'amount', 0
  );
end;
$function$;

revoke all on function public.apply_referral(text, text) from public, anon;
grant execute on function public.apply_referral(text, text) to authenticated, service_role;

-- Private dashboard: only auth.uid() can retrieve their balance, DOB, settings, and
-- complete referral list. No client can choose another person's ID here.
create or replace function public.get_my_referral_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_auth_id uuid := auth.uid();
  v_uid uuid;
  v_result jsonb;
  v_referrals jsonb;
begin
  if v_auth_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  v_uid := public.resolve_authenticated_profile_id();
  if v_uid is null then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  -- Claims are the source of reward status. The second branch is a display-only
  -- fallback for any older relationship marker that somehow has no claim row, so
  -- every referred member's profile remains visible without inventing a reward.
  with referral_rows as (
    select
      referred.id as user_id,
      referred.name,
      referred.profile_pic,
      c.created_at as referred_at,
      c.status,
      case when c.status in ('pending', 'awarded') then c.bonus_amount else 0 end as bonus_amount,
      c.qualified_at,
      c.awarded_at,
      c.qualifying_group_id,
      g.name as qualifying_group_name
    from public.referral_claims as c
    join public.users as referred on referred.id = c.referred_user_id
    left join public.groups as g on g.id = c.qualifying_group_id
    where c.referrer_user_id = v_uid

    union all

    select
      referred.id,
      referred.name,
      referred.profile_pic,
      referred.created_at,
      'referred'::text,
      0,
      null::timestamptz,
      null::timestamptz,
      null::text,
      null::text
    from public.users as referred
    where referred.id <> v_uid
      and (
        lower(btrim(referred.referred_by::text)) = lower(v_uid::text)
        or (
          length(btrim(referred.referred_by::text)) = 8
          and lower(btrim(referred.referred_by::text)) = left(lower(v_uid::text), 8)
        )
      )
      and not exists (
        select 1 from public.referral_claims as existing
        where existing.referred_user_id = referred.id
      )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', r.user_id,
        'name', coalesce(nullif(btrim(r.name), ''), 'PayRound member'),
        'profile_pic', r.profile_pic,
        'referred_at', r.referred_at,
        'status', r.status,
        'bonus_amount', r.bonus_amount,
        'qualified_at', r.qualified_at,
        'awarded_at', r.awarded_at,
        'qualifying_group_id', r.qualifying_group_id,
        'qualifying_group_name', r.qualifying_group_name
      ) order by r.referred_at desc
    ),
    '[]'::jsonb
  ) into v_referrals
  from referral_rows as r;

  select jsonb_build_object(
    'total_earnings', coalesce(u.referral_earnings, 0),
    'eligible', public.referral_referrer_is_eligible(v_uid),
    'referrals_public', coalesce(u.referrals_public, false),
    'dob_public', coalesce(u.dob_public, false),
    'dob', u.dob,
    'referral_count', jsonb_array_length(v_referrals),
    'pending_total', coalesce((
      select sum(c.bonus_amount) from public.referral_claims c
      where c.referrer_user_id = v_uid and c.status = 'pending'
    ), 0),
    'awarded_total', coalesce((
      select sum(c.bonus_amount) from public.referral_claims c
      where c.referrer_user_id = v_uid and c.status = 'awarded'
    ), 0),
    'referrals', v_referrals
  ) into v_result
  from public.users as u
  where u.id = v_uid;

  if v_result is null then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  return v_result;
end;
$function$;

revoke all on function public.get_my_referral_dashboard() from public, anon;
grant execute on function public.get_my_referral_dashboard() to authenticated, service_role;

create or replace function public.set_profile_privacy(
  p_referrals_public boolean,
  p_dob_public boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_auth_id uuid := auth.uid();
  v_uid uuid;
  v_result jsonb;
begin
  if v_auth_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  v_uid := public.resolve_authenticated_profile_id();
  if v_uid is null then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  update public.users
  set referrals_public = coalesce(p_referrals_public, false),
      dob_public = coalesce(p_dob_public, false)
  where id = v_uid
  returning jsonb_build_object(
    'referrals_public', referrals_public,
    'dob_public', dob_public
  ) into v_result;

  if v_result is null then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;
  return v_result;
end;
$function$;

revoke all on function public.set_profile_privacy(boolean, boolean) from public, anon;
grant execute on function public.set_profile_privacy(boolean, boolean) to authenticated, service_role;

-- Single-purpose setters keep the two privacy choices truly independent. They also
-- prevent one page from overwriting the other setting with stale client state.
create or replace function public.set_referral_list_privacy(p_public boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_auth_id uuid := auth.uid();
  v_uid uuid;
  v_result jsonb;
begin
  if v_auth_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  v_uid := public.resolve_authenticated_profile_id();
  if v_uid is null then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  update public.users
  set referrals_public = coalesce(p_public, false)
  where id = v_uid
  returning jsonb_build_object('referrals_public', referrals_public) into v_result;

  if v_result is null then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;
  return v_result;
end;
$function$;

revoke all on function public.set_referral_list_privacy(boolean) from public, anon;
grant execute on function public.set_referral_list_privacy(boolean) to authenticated, service_role;

create or replace function public.set_dob_privacy(p_public boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_auth_id uuid := auth.uid();
  v_uid uuid;
  v_result jsonb;
begin
  if v_auth_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  v_uid := public.resolve_authenticated_profile_id();
  if v_uid is null then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  update public.users
  set dob_public = coalesce(p_public, false)
  where id = v_uid
  returning jsonb_build_object('dob_public', dob_public) into v_result;

  if v_result is null then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;
  return v_result;
end;
$function$;

revoke all on function public.set_dob_privacy(boolean) from public, anon;
grant execute on function public.set_dob_privacy(boolean) to authenticated, service_role;

commit;
