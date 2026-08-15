-- PayRound owner referral payouts + payout-aware balances
-- Independently deployable follow-up for the already-live referral/privacy release.
-- Safe to rerun. Run as one transaction only after the original referral migration.

begin;

do $requirements$
begin
  if to_regclass('public.users') is null
     or to_regclass('public.referral_claims') is null
     or to_regclass('public.notifications') is null
     or to_regprocedure('public.is_owner()') is null
     or to_regprocedure('public.resolve_authenticated_profile_id()') is null
     or to_regprocedure('public.referral_referrer_is_eligible(uuid)') is null then
    raise exception using
      errcode = '55000',
      message = 'Deploy the existing referral/privacy migration before this payout follow-up';
  end if;
end;
$requirements$;

-- Cash payouts are a separate immutable audit trail. A referral claim records when
-- a bonus was earned; this table records when the owner actually paid some or all of
-- the user's available referral balance.
create table if not exists public.referral_payouts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  user_email text not null,
  user_name text,
  amount integer not null check (amount > 0),
  balance_before integer not null check (balance_before >= 0),
  balance_after integer not null check (balance_after >= 0),
  paid_by_auth_user_id uuid,
  paid_by_email text not null,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  check (balance_after = balance_before - amount)
);

alter table public.referral_payouts
  add column if not exists request_id uuid default gen_random_uuid();
update public.referral_payouts set request_id = gen_random_uuid() where request_id is null;
alter table public.referral_payouts alter column request_id set not null;

create unique index if not exists referral_payouts_request_uidx
  on public.referral_payouts (request_id);
create index if not exists referral_payouts_user_created_idx
  on public.referral_payouts (user_id, created_at desc);

alter table public.referral_payouts enable row level security;
revoke all on table public.referral_payouts from public, anon, authenticated;

-- Pay every pending N500 claim for one newly eligible referrer. The profile row is
-- locked before claims change so a simultaneous owner cash payout cannot be lost.
-- The available balance is always lifetime awarded claims minus recorded payouts.
create or replace function public.pay_pending_referral_bonuses(p_referrer_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_count integer := 0;
  v_referred_ids uuid[] := array[]::uuid[];
  v_referred_id uuid;
  v_ref_email text;
  v_referred_name text;
begin
  if p_referrer_id is null
     or not public.referral_referrer_is_eligible(p_referrer_id) then
    return 0;
  end if;

  -- Use the same per-user lock as owner_pay_referral_bonus().
  perform 1
  from public.users
  where id = p_referrer_id
  for update;

  if not found then
    return 0;
  end if;

  with paid as (
    update public.referral_claims as c
    set status = 'awarded',
        bonus_amount = 500,
        awarded_at = now()
    where c.referrer_user_id = p_referrer_id
      and c.status = 'pending'
      and c.qualifying_group_id is not null
    returning c.referred_user_id
  )
  select count(*)::integer,
         coalesce(array_agg(referred_user_id), array[]::uuid[])
    into v_count, v_referred_ids
  from paid;

  if v_count = 0 then
    return 0;
  end if;

  update public.users as u
  set referral_earnings = greatest(
    coalesce((
      select sum(c.bonus_amount)
      from public.referral_claims as c
      where c.referrer_user_id = p_referrer_id
        and c.status = 'awarded'
    ), 0) - coalesce((
      select sum(p.amount)
      from public.referral_payouts as p
      where p.user_id = p_referrer_id
    ), 0),
    0
  )
  where u.id = p_referrer_id
  returning lower(btrim(u.email)) into v_ref_email;

  foreach v_referred_id in array v_referred_ids loop
    select coalesce(nullif(btrim(name), ''), 'A referred member')
      into v_referred_name
    from public.users
    where id = v_referred_id;

    begin
      insert into public.notifications (id, type, user_email, message, is_read)
      values (
        'ref500-paid-' || v_referred_id::text,
        'referral_bonus',
        v_ref_email,
        '🎁 ' || coalesce(v_referred_name, 'A referred member') ||
          ' created a PayRound-approved group — ₦500 has been added to your referral balance.',
        false
      )
      on conflict (id) do nothing;
    exception when others then
      null;
    end;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.pay_pending_referral_bonuses(uuid) from public, anon, authenticated;

-- The profile column is a protected available-balance cache, never an independent
-- source of rewards. Reconcile it to awarded claims minus recorded cash payouts.
with balances as (
  select
    u.id,
    greatest(
      coalesce((
        select sum(c.bonus_amount)
        from public.referral_claims as c
        where c.referrer_user_id = u.id
          and c.status = 'awarded'
      ), 0) - coalesce((
        select sum(p.amount)
        from public.referral_payouts as p
        where p.user_id = u.id
      ), 0),
      0
    )::integer as total
  from public.users as u
)
update public.users as u
set referral_earnings = b.total
from balances as b
where u.id = b.id
  and coalesce(u.referral_earnings, 0) is distinct from b.total;

-- Owner-only cash payout. The amount can be any whole-naira value up to the user's
-- available balance. A per-user row lock serializes payouts with automatic awards.
drop function if exists public.owner_pay_referral_bonus(uuid, integer, text);

create or replace function public.owner_pay_referral_bonus(
  p_user_id uuid,
  p_amount integer,
  p_note text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_email text;
  v_user_name text;
  v_lifetime_earned integer := 0;
  v_already_paid integer := 0;
  v_balance_before integer := 0;
  v_balance_after integer := 0;
  v_payout_id uuid;
  v_note text := nullif(btrim(p_note), '');
  v_actor_email text;
  v_existing public.referral_payouts%rowtype;
begin
  if auth.uid() is null or not public.is_owner() then
    raise exception using errcode = '42501', message = 'PayRound owner access required';
  end if;

  if p_user_id is null then
    raise exception using errcode = '22004', message = 'Choose a referral earner';
  end if;

  if p_request_id is null then
    raise exception using errcode = '22004', message = 'Payout request ID is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'Payout amount must be greater than zero';
  end if;

  if v_note is not null and length(v_note) > 500 then
    raise exception using errcode = '22023', message = 'Payout note is too long';
  end if;

  v_actor_email := nullif(lower(btrim(auth.jwt() ->> 'email')), '');
  if v_actor_email is null then
    select lower(btrim(au.email)) into v_actor_email
    from auth.users as au
    where au.id = auth.uid();
  end if;
  if v_actor_email is null then
    raise exception using errcode = '42501', message = 'Owner identity is unavailable';
  end if;

  -- Serialize retries that carry the same client-generated request ID. If the first
  -- HTTP response is lost, an exact retry returns its original audit row and never
  -- deducts or notifies twice.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select p.* into v_existing
  from public.referral_payouts as p
  where p.request_id = p_request_id;

  if found then
    if v_existing.paid_by_auth_user_id is distinct from auth.uid()
       or v_existing.user_id is distinct from p_user_id
       or v_existing.amount is distinct from p_amount
       or v_existing.note is distinct from v_note then
      raise exception using errcode = '22023', message = 'Payout request ID was already used for different details';
    end if;

    return jsonb_build_object(
      'ok', true,
      'idempotent_replay', true,
      'request_id', v_existing.request_id,
      'payout_id', v_existing.id,
      'user_id', v_existing.user_id,
      'user_name', v_existing.user_name,
      'amount', v_existing.amount,
      'balance_before', v_existing.balance_before,
      'balance_after', v_existing.balance_after,
      'paid_at', v_existing.created_at
    );
  end if;

  select lower(btrim(u.email)), coalesce(nullif(btrim(u.name), ''), 'PayRound member')
    into v_user_email, v_user_name
  from public.users as u
  where u.id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Referral earner not found';
  end if;

  select coalesce(sum(c.bonus_amount), 0)::integer
    into v_lifetime_earned
  from public.referral_claims as c
  where c.referrer_user_id = p_user_id
    and c.status = 'awarded';

  select coalesce(sum(p.amount), 0)::integer
    into v_already_paid
  from public.referral_payouts as p
  where p.user_id = p_user_id;

  v_balance_before := greatest(v_lifetime_earned - v_already_paid, 0);

  if p_amount > v_balance_before then
    raise exception using
      errcode = '22023',
      message = format(
        'Payout amount exceeds the available referral balance of ₦%s',
        v_balance_before
      );
  end if;

  v_balance_after := v_balance_before - p_amount;

  insert into public.referral_payouts (
    request_id,
    user_id,
    user_email,
    user_name,
    amount,
    balance_before,
    balance_after,
    paid_by_auth_user_id,
    paid_by_email,
    note
  ) values (
    p_request_id,
    p_user_id,
    v_user_email,
    v_user_name,
    p_amount,
    v_balance_before,
    v_balance_after,
    auth.uid(),
    v_actor_email,
    v_note
  )
  returning id into v_payout_id;

  update public.users
  set referral_earnings = v_balance_after
  where id = p_user_id;

  insert into public.notifications (id, type, user_email, message, is_read)
  values (
    'referral-payout-' || v_payout_id::text,
    'referral_payout',
    v_user_email,
    '💸 PayRound paid ₦' || trim(to_char(p_amount, 'FM999,999,999,990')) ||
      ' from your referral balance. Your remaining referral balance is ₦' ||
      trim(to_char(v_balance_after, 'FM999,999,999,990')) || '.',
    false
  )
  on conflict (id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'request_id', p_request_id,
    'payout_id', v_payout_id,
    'user_id', p_user_id,
    'user_name', v_user_name,
    'amount', p_amount,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'paid_at', now()
  );
end;
$function$;

revoke all on function public.owner_pay_referral_bonus(uuid, integer, text, uuid) from public, anon;
grant execute on function public.owner_pay_referral_bonus(uuid, integer, text, uuid) to authenticated;

-- Owner-only operational view. It exposes every recorded referral relationship and
-- each qualification/award/payout event without weakening user-facing privacy.
create or replace function public.get_owner_referral_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_stats jsonb;
  v_referrers jsonb;
  v_payouts jsonb;
begin
  if auth.uid() is null or not public.is_owner() then
    raise exception using errcode = '42501', message = 'PayRound owner access required';
  end if;

  select jsonb_build_object(
    'relationship_count', (select count(*) from public.referral_claims),
    'unqualified_count', (select count(*) from public.referral_claims where status in ('referred', 'legacy')),
    'pending_count', (select count(*) from public.referral_claims where status = 'pending'),
    'awarded_count', (select count(*) from public.referral_claims where status = 'awarded'),
    'available_balance', greatest(
      (select coalesce(sum(bonus_amount), 0) from public.referral_claims where status = 'awarded') -
      (select coalesce(sum(amount), 0) from public.referral_payouts),
      0
    ),
    'lifetime_earned', (
      select coalesce(sum(bonus_amount), 0)
      from public.referral_claims
      where status = 'awarded'
    ),
    'paid_out', (select coalesce(sum(amount), 0) from public.referral_payouts)
  ) into v_stats;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', u.id,
        'name', coalesce(nullif(btrim(u.name), ''), 'PayRound member'),
        'email', lower(btrim(u.email)),
        'profile_pic', u.profile_pic,
        'eligible', public.referral_referrer_is_eligible(u.id),
        'available_balance', greatest(
          coalesce((
            select sum(c.bonus_amount)
            from public.referral_claims as c
            where c.referrer_user_id = u.id and c.status = 'awarded'
          ), 0) - coalesce((
            select sum(p.amount)
            from public.referral_payouts as p
            where p.user_id = u.id
          ), 0),
          0
        ),
        'lifetime_earned', coalesce((
          select sum(c.bonus_amount)
          from public.referral_claims as c
          where c.referrer_user_id = u.id and c.status = 'awarded'
        ), 0),
        'paid_out', coalesce((
          select sum(p.amount)
          from public.referral_payouts as p
          where p.user_id = u.id
        ), 0),
        'referral_count', (
          select count(*) from public.referral_claims as c where c.referrer_user_id = u.id
        ),
        'unqualified_count', (
          select count(*) from public.referral_claims as c
          where c.referrer_user_id = u.id and c.status in ('referred', 'legacy')
        ),
        'pending_count', (
          select count(*) from public.referral_claims as c
          where c.referrer_user_id = u.id and c.status = 'pending'
        ),
        'awarded_count', (
          select count(*) from public.referral_claims as c
          where c.referrer_user_id = u.id and c.status = 'awarded'
        ),
        'referrals', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'user_id', referred.id,
              'name', coalesce(nullif(btrim(referred.name), ''), 'PayRound member'),
              'email', lower(btrim(referred.email)),
              'profile_pic', referred.profile_pic,
              'status', c.status,
              'bonus_amount', case when c.status in ('pending', 'awarded') then c.bonus_amount else 0 end,
              'source', c.source,
              'referred_at', c.created_at,
              'qualified_at', c.qualified_at,
              'awarded_at', c.awarded_at,
              'qualifying_group_id', c.qualifying_group_id,
              'qualifying_group_name', g.name
            ) order by c.created_at desc
          )
          from public.referral_claims as c
          join public.users as referred on referred.id = c.referred_user_id
          left join public.groups as g on g.id = c.qualifying_group_id
          where c.referrer_user_id = u.id
        ), '[]'::jsonb)
      ) order by greatest(
        coalesce((
          select sum(c.bonus_amount) from public.referral_claims as c
          where c.referrer_user_id = u.id and c.status = 'awarded'
        ), 0) - coalesce((
          select sum(p.amount) from public.referral_payouts as p
          where p.user_id = u.id
        ), 0),
        0
      ) desc, u.created_at desc
    ),
    '[]'::jsonb
  ) into v_referrers
  from public.users as u
  where exists (
      select 1 from public.referral_claims as c where c.referrer_user_id = u.id
    )
    or exists (
      select 1 from public.referral_payouts as p where p.user_id = u.id
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'request_id', p.request_id,
        'user_id', p.user_id,
        'user_name', p.user_name,
        'user_email', p.user_email,
        'amount', p.amount,
        'balance_before', p.balance_before,
        'balance_after', p.balance_after,
        'paid_by_email', p.paid_by_email,
        'note', p.note,
        'created_at', p.created_at
      ) order by p.created_at desc
    ),
    '[]'::jsonb
  ) into v_payouts
  from public.referral_payouts as p;

  return jsonb_build_object(
    'stats', v_stats,
    'referrers', v_referrers,
    'payouts', v_payouts,
    'generated_at', now()
  );
end;
$function$;

revoke all on function public.get_owner_referral_dashboard() from public, anon;
grant execute on function public.get_owner_referral_dashboard() to authenticated;

-- Private dashboard: only the securely resolved authenticated profile can retrieve
-- its balance, DOB, settings, and complete referral list. No client chooses an ID.
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
    'total_earnings', greatest(
      coalesce((
        select sum(c.bonus_amount) from public.referral_claims c
        where c.referrer_user_id = v_uid and c.status = 'awarded'
      ), 0) - coalesce((
        select sum(p.amount) from public.referral_payouts p
        where p.user_id = v_uid
      ), 0),
      0
    ),
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
    'paid_total', coalesce((
      select sum(p.amount) from public.referral_payouts p
      where p.user_id = v_uid
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

-- Privacy-safe public projection. It returns no DOB or list data unless the target
-- account explicitly enabled the relevant setting. Direct SELECT privileges for the
-- underlying private columns are removed below.
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
         greatest(
           coalesce((
             select sum(c.bonus_amount) from public.referral_claims c
             where c.referrer_user_id = p_user_id and c.status = 'awarded'
           ), 0) - coalesce((
             select sum(p.amount) from public.referral_payouts p
             where p.user_id = p_user_id
           ), 0),
           0
         )
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

-- Final hardening and deployment assertions.
alter table public.referral_payouts enable row level security;
revoke all on table public.referral_payouts from public, anon, authenticated;

do $verify$
begin
  if to_regprocedure('public.owner_pay_referral_bonus(uuid,integer,text,uuid)') is null
     or to_regprocedure('public.get_owner_referral_dashboard()') is null
     or not has_function_privilege('authenticated', 'public.owner_pay_referral_bonus(uuid,integer,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.owner_pay_referral_bonus(uuid,integer,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_owner_referral_dashboard()', 'execute')
     or has_function_privilege('anon', 'public.get_owner_referral_dashboard()', 'execute')
     or has_table_privilege('authenticated', 'public.referral_payouts', 'select')
     or has_table_privilege('anon', 'public.referral_payouts', 'select') then
    raise exception using errcode = '55000', message = 'Referral payout security verification failed';
  end if;
end;
$verify$;

commit;
