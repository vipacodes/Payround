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

commit;
