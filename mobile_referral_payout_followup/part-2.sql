begin;

do $requirements$
begin
  if to_regclass('public.referral_payouts') is null or to_regprocedure('public.is_owner()') is null then
    raise exception 'Run payout follow-up part 1 first';
  end if;
end;
$requirements$;

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

alter table public.referral_payouts enable row level security;
revoke all on table public.referral_payouts from public, anon, authenticated;

commit;
