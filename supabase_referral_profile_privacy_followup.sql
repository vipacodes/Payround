-- PayRound referral profile/privacy follow-up
-- Safe to run after supabase_referral_eligibility_fix.sql.
-- Keeps every referred profile visible, never assigns a display-only relationship
-- a bonus, and gives each privacy choice its own authenticated setter.

begin;

create or replace function public.get_my_referral_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_referrals jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Authentication required';
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

create or replace function public.set_referral_list_privacy(p_public boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Authentication required';
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
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Authentication required';
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

create or replace function public.get_public_profile_extras(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_result jsonb;
  v_referrals jsonb := '[]'::jsonb;
  v_refs_public boolean := false;
  v_dob_public boolean := false;
  v_dob text;
  v_total integer := 0;
begin
  select coalesce(u.referrals_public, false),
         coalesce(u.dob_public, false),
         u.dob,
         coalesce(u.referral_earnings, 0)
    into v_refs_public, v_dob_public, v_dob, v_total
  from public.users as u
  where u.id = p_user_id;

  if not found then
    return jsonb_build_object(
      'found', false,
      'dob_visible', false,
      'referrals_visible', false,
      'referrals', '[]'::jsonb
    );
  end if;

  if v_refs_public then
    with referral_rows as (
      select
        referred.id as user_id,
        referred.name,
        referred.profile_pic,
        c.created_at as referred_at,
        c.status,
        case when c.status in ('pending', 'awarded') then c.bonus_amount else 0 end as bonus_amount,
        c.qualified_at,
        c.awarded_at
      from public.referral_claims as c
      join public.users as referred on referred.id = c.referred_user_id
      where c.referrer_user_id = p_user_id

      union all

      select
        referred.id,
        referred.name,
        referred.profile_pic,
        referred.created_at,
        'referred'::text,
        0,
        null::timestamptz,
        null::timestamptz
      from public.users as referred
      where referred.id <> p_user_id
        and (
          lower(btrim(referred.referred_by::text)) = lower(p_user_id::text)
          or (
            length(btrim(referred.referred_by::text)) = 8
            and lower(btrim(referred.referred_by::text)) = left(lower(p_user_id::text), 8)
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
          'awarded_at', r.awarded_at
        ) order by r.referred_at desc
      ),
      '[]'::jsonb
    ) into v_referrals
    from referral_rows as r;
  end if;

  v_result := jsonb_build_object(
    'found', true,
    'dob_visible', v_dob_public,
    'dob', case when v_dob_public then to_jsonb(v_dob) else 'null'::jsonb end,
    'referrals_visible', v_refs_public,
    'total_earnings', case when v_refs_public then v_total else 0 end,
    'referral_count', case when v_refs_public then jsonb_array_length(v_referrals) else 0 end,
    'referrals', case when v_refs_public then v_referrals else '[]'::jsonb end
  );
  return v_result;
end;
$function$;

revoke all on function public.get_public_profile_extras(uuid) from public, anon;
grant execute on function public.get_public_profile_extras(uuid) to authenticated, service_role;

commit;
