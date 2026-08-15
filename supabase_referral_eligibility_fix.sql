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

-- Upgrade the earlier, undeployed N200 draft safely if it was ever installed in a
-- test database. Existing draft claims become legacy records and balances stay put.
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

-- Pay every pending N500 claim for one newly eligible referrer. Updating claim rows
-- first makes concurrent trigger calls idempotent; the user's balance is incremented
-- once by exactly the number of rows this transaction moved to awarded.
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

  update public.users
  set referral_earnings = coalesce(referral_earnings, 0) + (v_count * 500)
  where id = p_referrer_id
  returning lower(btrim(email)) into v_ref_email;

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
          ' created a PayRound-approved group — ₦500 has been added to your referral earnings.',
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

  if nullif(btrim(p_new_email), '') is null or nullif(btrim(p_ref), '') is null then
    return jsonb_build_object('ok', false, 'why', 'missing');
  end if;

  select lower(btrim(u.email)), coalesce(nullif(btrim(u.name), ''), 'A new member')
    into v_new_email, v_new_name
  from public.users as u
  where u.id = v_auth_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'why', 'profile_not_found');
  end if;

  if v_new_email <> lower(btrim(p_new_email)) then
    return jsonb_build_object('ok', false, 'why', 'identity_mismatch');
  end if;

  select c.status into v_existing_status
  from public.referral_claims as c
  where c.referred_user_id = v_auth_id;

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
  if v_ref_id = v_auth_id then
    return jsonb_build_object('ok', false, 'why', 'self_referral');
  end if;

  select lower(btrim(u.email)) into v_ref_email
  from public.users as u
  where u.id = v_ref_id
  for update;

  update public.users
  set referred_by = v_ref_id::text
  where id = v_auth_id;

  insert into public.referral_claims (
    referred_user_id, referrer_user_id, bonus_amount, status
  ) values (
    v_auth_id, v_ref_id, 0, 'referred'
  );

  begin
    insert into public.notifications (id, type, user_email, message, is_read)
    values (
      'ref-recorded-' || v_auth_id::text,
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
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_referrals jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', referred.id,
        'name', coalesce(nullif(btrim(referred.name), ''), 'PayRound member'),
        'profile_pic', referred.profile_pic,
        'referred_at', c.created_at,
        'status', c.status,
        'bonus_amount', case when c.status in ('pending', 'awarded') then c.bonus_amount else 0 end,
        'qualified_at', c.qualified_at,
        'awarded_at', c.awarded_at,
        'qualifying_group_id', c.qualifying_group_id,
        'qualifying_group_name', g.name
      ) order by c.created_at desc
    ),
    '[]'::jsonb
  ) into v_referrals
  from public.referral_claims as c
  join public.users as referred on referred.id = c.referred_user_id
  left join public.groups as g on g.id = c.qualifying_group_id
  where c.referrer_user_id = v_uid;

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
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Authentication required';
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
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', referred.id,
          'name', coalesce(nullif(btrim(referred.name), ''), 'PayRound member'),
          'profile_pic', referred.profile_pic,
          'referred_at', c.created_at,
          'status', c.status,
          'bonus_amount', case when c.status in ('pending', 'awarded') then c.bonus_amount else 0 end,
          'qualified_at', c.qualified_at,
          'awarded_at', c.awarded_at
        ) order by c.created_at desc
      ),
      '[]'::jsonb
    ) into v_referrals
    from public.referral_claims as c
    join public.users as referred on referred.id = c.referred_user_id
    where c.referrer_user_id = p_user_id;
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
