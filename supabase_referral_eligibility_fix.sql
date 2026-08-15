-- PayRound future group-qualified referral bonuses and profile privacy
-- Run once in Supabase Dashboard -> SQL Editor. Safe to re-run.
--
-- New rules implemented here:
--   * a valid referral is recorded at signup, with no signup payment;
--   * the referred person qualifies only when one of their groups later enters
--     the PayRound-approved state (active/approved);
--   * that person can create at most one N500 claim, regardless of group count;
--   * the claim stays pending until the referrer owns or is an approved member
--     of an active/approved group, then it is released automatically;
--   * no existing active/approved group is scanned, so this is not retroactive;
--   * referral lists and dates of birth are private unless the account holder
--     explicitly opts in through the privacy RPC below.

begin;

alter table public.users
  add column if not exists referrals_public boolean not null default false,
  add column if not exists dob_public boolean not null default false;

create table if not exists public.referral_claims (
  referred_user_id uuid primary key references public.users(id) on delete cascade,
  referrer_user_id uuid not null references public.users(id) on delete cascade,
  qualifying_group_id text,
  bonus_amount integer not null default 0 check (bonus_amount >= 0),
  status text not null default 'referred',
  source text not null default 'apply_referral',
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  awarded_at timestamptz
);

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

-- Upgrade the earlier N200 draft safely if it was ever installed. Existing draft
-- claims become relationship-only legacy records; balances are reconciled below to
-- awarded group-qualified claims so an old signup amount cannot appear as earnings.
do $upgrade$
declare
  v_old_shape boolean;
  v_constraint record;
begin
  select not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'referral_claims'
      and column_name = 'qualifying_group_id'
  ) into v_old_shape;

  if v_old_shape then
    alter table public.referral_claims
      add column qualifying_group_id text,
      add column qualified_at timestamptz,
      add column awarded_at timestamptz;
    update public.referral_claims
    set status = 'legacy', source = 'legacy_pre_group_bonus'
    where status <> 'legacy';
  else
    alter table public.referral_claims
      add column if not exists qualifying_group_id text,
      add column if not exists qualified_at timestamptz,
      add column if not exists awarded_at timestamptz;
  end if;

  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.referral_claims'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.referral_claims drop constraint %I', v_constraint.conname);
  end loop;
end;
$upgrade$;

alter table public.referral_claims
  add constraint referral_claims_status_check
  check (status in ('referred', 'pending', 'awarded', 'legacy'));

create index if not exists referral_claims_referrer_idx
  on public.referral_claims (referrer_user_id, status, created_at desc);
create index if not exists referral_claims_group_idx
  on public.referral_claims (qualifying_group_id)
  where qualifying_group_id is not null;

alter table public.referral_claims enable row level security;
revoke all on table public.referral_claims from public, anon, authenticated;

-- Snapshot groups that were already approved when this migration was first installed.
-- They remain permanently excluded even if later frozen/reactivated, closing a subtle
-- route to retroactive awards. The singleton state row makes re-runs harmless.
create table if not exists public.referral_bonus_migration_state (
  id integer primary key check (id = 1),
  installed_at timestamptz not null default now()
);
create table if not exists public.referral_bonus_excluded_groups (
  group_id text primary key,
  recorded_at timestamptz not null default now()
);
revoke all on table public.referral_bonus_migration_state from public, anon, authenticated;
revoke all on table public.referral_bonus_excluded_groups from public, anon, authenticated;

with first_install as (
  insert into public.referral_bonus_migration_state (id)
  values (1)
  on conflict (id) do nothing
  returning id
)
insert into public.referral_bonus_excluded_groups (group_id)
select g.id
from public.groups as g
cross join first_install
where lower(coalesce(g.status, '')) in ('active', 'approved')
on conflict (group_id) do nothing;

-- Keep client-side profile updates from forging balances or changing referral
-- ownership. A signup insert may carry the referral marker, but always starts at N0.
create or replace function public.guard_referral_accounting()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $guard$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.referral_earnings := 0;
    elsif new.referral_earnings is distinct from old.referral_earnings
       or new.referred_by is distinct from old.referred_by then
      raise exception using
        errcode = '42501',
        message = 'Referral accounting can only be changed by PayRound';
    end if;
  end if;
  return new;
end;
$guard$;

revoke all on function public.guard_referral_accounting() from public, anon, authenticated;
drop trigger if exists guard_referral_accounting on public.users;
create trigger guard_referral_accounting
before insert or update on public.users
for each row execute function public.guard_referral_accounting();

-- Existing referral markers become relationship-only records. No balance changes
-- occur and, critically, existing approved groups are not inspected here.
lock table public.users in share row exclusive mode;

with legacy_candidates as (
  select
    referred.id as referred_user_id,
    min(referrer.id::text)::uuid as referrer_user_id,
    count(*) as candidate_count,
    referred.created_at
  from public.users as referred
  join public.users as referrer
    on lower(referrer.id::text) = lower(btrim(referred.referred_by::text))
    or (
      length(btrim(referred.referred_by::text)) = 8
      and left(lower(referrer.id::text), 8) = lower(btrim(referred.referred_by::text))
    )
  where nullif(btrim(referred.referred_by::text), '') is not null
    and referred.id <> referrer.id
  group by referred.id, referred.created_at
)
insert into public.referral_claims (
  referred_user_id, referrer_user_id, bonus_amount, status, source, created_at
)
select
  referred_user_id,
  referrer_user_id,
  0,
  'referred',
  'legacy_relationship_import',
  coalesce(created_at, now())
from legacy_candidates
where candidate_count = 1
on conflict (referred_user_id) do nothing;

-- A referrer is eligible only through a PayRound-approved group: ownership of an
-- active/approved group, or approved membership in one.
create or replace function public.referral_referrer_is_eligible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.users as u
    where u.id = p_user_id
      and (
        exists (
          select 1
          from public.groups as g
          where lower(btrim(g.admin_email)) = lower(btrim(u.email))
            and lower(coalesce(g.status, '')) in ('active', 'approved')
        )
        or exists (
          select 1
          from public.members as m
          join public.groups as g on g.id = m.group_id
          where lower(btrim(m.member_email)) = lower(btrim(u.email))
            and lower(coalesce(m.status, '')) = 'approved'
            and lower(coalesce(g.status, '')) in ('active', 'approved')
        )
      )
  );
$function$;

revoke all on function public.referral_referrer_is_eligible(uuid) from public, anon, authenticated;

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

-- Replace obsolete N200 signup-bonus notices with a relationship-only explanation.
-- This both removes the false reward claim and avoids retaining the referred email in
-- the old notification text.
update public.notifications
set type = 'referral_recorded',
    message = '👋 A member joined with your referral link. No signup bonus was awarded. You can earn ₦500 only after PayRound approves their first group under the current rules.'
where type = 'referral_bonus'
  and (
    message ilike '%earned ₦200%'
    or message ilike '%earned N200%'
  );

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

-- Only PayRound owner accounts (or trusted server-side roles) may move a group into
-- an approval state. This prevents a group admin from self-approving to mint money.
create or replace function public.guard_group_referral_approval()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth
as $function$
declare
  v_actor text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_owner boolean := v_actor in (
    'payround1@gmail.com',
    'payround2@gmail.com',
    'payroundsupport@gmail.com',
    'vipadarapper@gmail.com'
  );
begin
  if current_user = 'authenticated'
     and lower(coalesce(new.status, '')) in ('active', 'approved')
     and not v_owner then
    if tg_op = 'INSERT' then
      raise exception using
        errcode = '42501',
        message = 'Only PayRound can approve a group';
    elsif new.status is distinct from old.status
       or new.admin_email is distinct from old.admin_email then
      raise exception using
        errcode = '42501',
        message = 'Only PayRound can approve a group';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.guard_group_referral_approval() from public, anon, authenticated;
drop trigger if exists guard_group_referral_approval on public.groups;
create trigger guard_group_referral_approval
before insert or update of status, admin_email on public.groups
for each row execute function public.guard_group_referral_approval();

-- Protect membership approval transitions too. An account may accept a genuine
-- spot_offered row; it cannot manufacture that prerequisite itself.
create or replace function public.guard_member_referral_approval()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth
as $function$
declare
  v_actor text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_admin text;
  v_owner boolean := v_actor in (
    'payround1@gmail.com',
    'payround2@gmail.com',
    'payroundsupport@gmail.com',
    'vipadarapper@gmail.com'
  );
  v_new_status text := lower(coalesce(new.status, ''));
  v_old_status text := case when tg_op = 'UPDATE' then lower(coalesce(old.status, '')) else '' end;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  select lower(btrim(g.admin_email)) into v_admin
  from public.groups as g
  where g.id = new.group_id;

  if v_new_status = 'spot_offered'
     and (tg_op = 'INSERT' or v_new_status is distinct from v_old_status)
     and not (v_owner or v_actor = v_admin) then
    raise exception using
      errcode = '42501',
      message = 'Only the group admin can offer a spot';
  end if;

  if v_new_status = 'approved'
     and (tg_op = 'INSERT' or v_new_status is distinct from v_old_status)
     and not (
       v_owner
       or v_actor = v_admin
       or (
         tg_op = 'UPDATE'
         and v_actor = lower(btrim(new.member_email))
         and v_old_status = 'spot_offered'
       )
     ) then
    raise exception using
      errcode = '42501',
      message = 'Membership approval must come from the group admin or a valid spot offer';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_member_referral_approval() from public, anon, authenticated;
drop trigger if exists guard_member_referral_approval on public.members;
create trigger guard_member_referral_approval
before insert or update of status on public.members
for each row execute function public.guard_member_referral_approval();

-- A future transition into active/approved qualifies the referred group owner once.
-- It also releases pending claims belonging to the newly eligible group owner and
-- every already-approved member of that group.
create or replace function public.on_referral_group_approved()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_referred_id uuid;
  v_referrer_id uuid;
  v_referrer_email text;
  v_referred_name text;
  v_paid integer := 0;
  v_member_user_id uuid;
begin
  if lower(coalesce(new.status, '')) not in ('active', 'approved') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- An already-approved group never qualifies anyone again, even if another
    -- field is edited later. This is part of the no-retroactivity boundary.
    if lower(coalesce(old.status, '')) in ('active', 'approved') then
      return new;
    end if;
  end if;

  if exists (
    select 1
    from public.referral_bonus_excluded_groups as x
    where x.group_id = new.id
  ) then
    return new;
  end if;

  select u.id, coalesce(nullif(btrim(u.name), ''), 'A referred member')
    into v_referred_id, v_referred_name
  from public.users as u
  where lower(btrim(u.email)) = lower(btrim(new.admin_email))
  limit 1;

  if v_referred_id is not null then
    update public.referral_claims as c
    set qualifying_group_id = new.id,
        qualified_at = now(),
        bonus_amount = 500,
        status = 'pending'
    where c.referred_user_id = v_referred_id
      and c.status = 'referred'
    returning c.referrer_user_id into v_referrer_id;

    if found then
      v_paid := public.pay_pending_referral_bonuses(v_referrer_id);

      if v_paid = 0 then
        select lower(btrim(email)) into v_referrer_email
        from public.users where id = v_referrer_id;
        begin
          insert into public.notifications (id, type, user_email, message, is_read)
          values (
            'ref500-pending-' || v_referred_id::text,
            'referral_bonus_pending',
            v_referrer_email,
            '🎁 ' || coalesce(v_referred_name, 'A referred member') ||
              ' created a PayRound-approved group. Your ₦500 referral bonus is pending until you own or become an approved member of an approved group.',
            false
          )
          on conflict (id) do nothing;
        exception when others then
          null;
        end;
      end if;
    end if;

    -- Group ownership itself may make this user eligible for their own pending claims.
    perform public.pay_pending_referral_bonuses(v_referred_id);
  end if;

  -- Group approval also makes every already-approved member eligible.
  for v_member_user_id in
    select u.id
    from public.members as m
    join public.users as u
      on lower(btrim(u.email)) = lower(btrim(m.member_email))
    where m.group_id = new.id
      and lower(coalesce(m.status, '')) = 'approved'
  loop
    perform public.pay_pending_referral_bonuses(v_member_user_id);
  end loop;

  return new;
end;
$function$;

revoke all on function public.on_referral_group_approved() from public, anon, authenticated;
drop trigger if exists on_referral_group_approved on public.groups;
create trigger on_referral_group_approved
after insert or update of status on public.groups
for each row execute function public.on_referral_group_approved();

-- Approving membership in a group that is already approved releases that member's
-- pending bonuses. If the group is still pending, its later approval trigger does it.
create or replace function public.on_referral_member_approved()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid;
begin
  if lower(coalesce(new.status, '')) <> 'approved' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if lower(coalesce(old.status, '')) = 'approved' then
      return new;
    end if;
  end if;

  select u.id into v_user_id
  from public.users as u
  where lower(btrim(u.email)) = lower(btrim(new.member_email))
  limit 1;

  if v_user_id is not null then
    perform public.pay_pending_referral_bonuses(v_user_id);
  end if;
  return new;
end;
$function$;

revoke all on function public.on_referral_member_approved() from public, anon, authenticated;
drop trigger if exists on_referral_member_approved on public.members;
create trigger on_referral_member_approved
after insert or update of status on public.members
for each row execute function public.on_referral_member_approved();

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

-- Authenticated users retain the app's existing public profile columns, but cannot
-- directly read DOB, referral ownership, earnings, or privacy flags for arbitrary
-- users. Own-account access and opt-in public access go through the RPCs above.
revoke select on table public.users from public, anon, authenticated;
do $grant_safe_user_columns$
declare
  v_columns text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'users'
    and column_name not in (
      'dob',
      'referred_by',
      'referral_earnings',
      'referrals_public',
      'dob_public'
    );

  if nullif(v_columns, '') is not null then
    execute 'grant select (' || v_columns || ') on table public.users to authenticated';
  end if;
end;
$grant_safe_user_columns$;

commit;
