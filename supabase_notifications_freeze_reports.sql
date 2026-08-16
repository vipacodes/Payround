-- PayRound: reliable account notices, frozen-account enforcement, private reports
-- Rerunnable production migration (2026-08-16)
-- Safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- 0. Server-authoritative 1–12 month group-plan pricing
-- ---------------------------------------------------------------------------

create or replace function public.enforce_group_plan_price()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_one integer;
  v_six integer;
  v_twelve integer;
begin
  if new.plan_months is null then
    new.plan_price := null;
    return new;
  end if;
  if new.plan_months < 1 or new.plan_months > 12 then
    raise exception 'Group plan duration must be between 1 and 12 months' using errcode = '22023';
  end if;

  select p.plan_1m, p.plan_6m, p.plan_12m
  into v_one, v_six, v_twelve
  from public.public_pricing p
  where p.id = 1;

  if v_one is null or v_six is null or v_twelve is null then
    raise exception 'PayRound group pricing is not configured' using errcode = '55000';
  end if;

  new.plan_price := case
    when new.plan_months between 1 and 5 then v_one * new.plan_months
    when new.plan_months = 6 then v_six
    when new.plan_months between 7 and 11 then v_six + (v_one * (new.plan_months - 6))
    else v_twelve
  end;
  return new;
end;
$$;

drop trigger if exists groups_enforce_plan_price on public.groups;
create trigger groups_enforce_plan_price
before insert or update of plan_months, plan_price on public.groups
for each row execute function public.enforce_group_plan_price();

-- ---------------------------------------------------------------------------
-- 1. Freeze details: private user reason + separate group-admin-safe note
-- ---------------------------------------------------------------------------

alter table public.users add column if not exists freeze_reason_user text;
alter table public.users add column if not exists freeze_admin_note text;
alter table public.users add column if not exists frozen_at timestamptz;
alter table public.users add column if not exists unfrozen_at timestamptz;
alter table public.users add column if not exists frozen_by_email text;

-- Any legacy frozen row receives safe defaults before the required-details guard.
update public.users
set freeze_reason_user = coalesce(nullif(btrim(freeze_reason_user), ''),
      'PayRound temporarily restricted this account while an account matter is reviewed.'),
    freeze_admin_note = coalesce(nullif(btrim(freeze_admin_note), ''),
      'PayRound is reviewing this account. Keep private chat open only to resolve existing group or payment matters.'),
    frozen_at = coalesce(frozen_at, now())
where coalesce(is_frozen, false)
  and (nullif(btrim(freeze_reason_user), '') is null
       or nullif(btrim(freeze_admin_note), '') is null
       or frozen_at is null);

create or replace function public.require_account_freeze_details()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(new.is_frozen, false)
     and not coalesce(old.is_frozen, false)
     and (nullif(pg_catalog.btrim(coalesce(new.freeze_reason_user, '')), '') is null
          or nullif(pg_catalog.btrim(coalesce(new.freeze_admin_note, '')), '') is null) then
    raise exception 'Both the private user reason and group-admin-safe note are required to freeze an account'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists users_require_account_freeze_details on public.users;
create trigger users_require_account_freeze_details
before update of is_frozen on public.users
for each row execute function public.require_account_freeze_details();

create or replace function public.owner_set_user_freeze(
  p_user_id uuid,
  p_frozen boolean,
  p_user_reason text default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user public.users%rowtype;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_user_reason, '')), '');
  v_note text := nullif(pg_catalog.btrim(coalesce(p_admin_note, '')), '');
begin
  if auth.uid() is null or not public.payround_is_owner() then
    raise exception 'PayRound owner access required' using errcode = '42501';
  end if;
  if coalesce(p_frozen, false) and (v_reason is null or v_note is null) then
    raise exception 'Both the private user reason and group-admin-safe note are required'
      using errcode = '22023';
  end if;

  update public.users u
  set is_frozen = coalesce(p_frozen, false),
      freeze_reason_user = case when coalesce(p_frozen, false) then v_reason else u.freeze_reason_user end,
      freeze_admin_note = case when coalesce(p_frozen, false) then v_note else u.freeze_admin_note end,
      frozen_at = case when coalesce(p_frozen, false) then pg_catalog.now() else u.frozen_at end,
      unfrozen_at = case when coalesce(p_frozen, false) then null else pg_catalog.now() end,
      frozen_by_email = case when coalesce(p_frozen, false) then public.payround_actor_email() else u.frozen_by_email end
  where u.id = p_user_id
  returning u.* into v_user;

  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', v_user.id,
    'is_frozen', coalesce(v_user.is_frozen, false),
    'frozen_at', v_user.frozen_at,
    'unfrozen_at', v_user.unfrozen_at
  );
end;
$$;

revoke all on function public.owner_set_user_freeze(uuid, boolean, text, text) from public, anon;
grant execute on function public.owner_set_user_freeze(uuid, boolean, text, text) to authenticated;

-- The frozen user gets the private reason in the same transaction as the state change.
create or replace function public.notify_account_freeze_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(new.email, '')));
  v_type text;
  v_message text;
begin
  if new.is_frozen is not distinct from old.is_frozen or v_email = '' then
    return new;
  end if;

  if new.is_frozen then
    v_type := 'account_frozen';
    v_message := '❄️ PayRound froze your account. Reason: '
      || coalesce(nullif(pg_catalog.btrim(new.freeze_reason_user), ''), 'An account matter is under review.')
      || ' You can still privately message admins of your approved groups and PayRound Support. All other app actions and direct chats are paused.';
  else
    v_type := 'account_unfrozen';
    v_message := '🔥 PayRound unfroze your account. Your account is active again and you can use the app normally.';
  end if;

  insert into public.notifications (
    id, type, group_id, message, is_read, created_at, user_email
  ) values (
    'account-state-' || new.id::text || '-' || v_type || '-' || pg_catalog.txid_current()::text,
    v_type, null, v_message, false, pg_catalog.now(), v_email
  ) on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists users_notify_account_freeze_change on public.users;
create trigger users_notify_account_freeze_change
after update of is_frozen on public.users
for each row execute function public.notify_account_freeze_change();

-- Keep the admin-safe note private from the user's own general profile payload.
create or replace function public.get_my_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_actor text := public.payround_actor_email();
  v_result jsonb;
begin
  if v_uid is null or v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select to_jsonb(u) - array[
    'password_hash', 'reset_code', 'reset_expires',
    'freeze_admin_note', 'frozen_by_email'
  ]::text[]
  into v_result
  from public.users u
  where u.id = public.resolve_authenticated_profile_id();

  return v_result;
end;
$$;

create or replace function public.get_my_account_freeze_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.payround_actor_email();
  v_user public.users%rowtype;
  v_admins jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_user
  from public.users u
  where pg_catalog.lower(pg_catalog.btrim(u.email)) = v_actor
  limit 1;

  if not found then
    return jsonb_build_object('frozen', false, 'admins', '[]'::jsonb);
  end if;

  if coalesce(v_user.is_frozen, false) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'email', a.email,
      'name', a.name,
      'profile_pic', a.profile_pic,
      'is_verified', a.is_verified,
      'groups', a.groups
    ) order by a.name, a.email), '[]'::jsonb)
    into v_admins
    from (
      select u.id,
             pg_catalog.lower(pg_catalog.btrim(u.email)) as email,
             coalesce(nullif(pg_catalog.btrim(u.name), ''), u.email) as name,
             u.profile_pic,
             coalesce(u.is_verified, false) as is_verified,
             jsonb_agg(distinct jsonb_build_object('id', g.id, 'name', g.name)) as groups
      from public.members m
      join public.groups g on g.id = m.group_id
      join public.users u
        on pg_catalog.lower(pg_catalog.btrim(u.email)) = pg_catalog.lower(pg_catalog.btrim(g.admin_email))
      where pg_catalog.lower(pg_catalog.btrim(m.member_email)) = v_actor
        and pg_catalog.lower(coalesce(m.status, '')) in ('approved', 'active')
        and pg_catalog.lower(pg_catalog.btrim(g.admin_email)) <> v_actor
      group by u.id, u.email, u.name, u.profile_pic, u.is_verified
    ) a;
  end if;

  return jsonb_build_object(
    'frozen', coalesce(v_user.is_frozen, false),
    'reason', case when coalesce(v_user.is_frozen, false) then v_user.freeze_reason_user else null end,
    'frozen_at', v_user.frozen_at,
    'admins', v_admins,
    'support_available', true
  );
end;
$$;

revoke all on function public.get_my_account_freeze_status() from public, anon;
grant execute on function public.get_my_account_freeze_status() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Notification authorization without direct RLS subqueries
-- ---------------------------------------------------------------------------

create or replace function public.payround_can_insert_notification(
  p_user_email text,
  p_group_id text,
  p_type text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    auth.uid() is not null
    and (
      public.payround_is_owner()
      or pg_catalog.lower(pg_catalog.btrim(coalesce(p_user_email, ''))) = public.payround_actor_email()
      or (
        p_type = 'new_follower'
        and exists (
          select 1 from public.follows f
          where pg_catalog.lower(pg_catalog.btrim(f.follower_email)) = public.payround_actor_email()
            and pg_catalog.lower(pg_catalog.btrim(f.following_email)) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_user_email, '')))
        )
      )
      or (
        p_group_id is not null
        and p_type = any(array[
          'join_request','join_cancelled','request_cancelled','extra_spots_request',
          'offer_lapsed','offer_accepted','offer_declined','payment_submitted','group_full'
        ]::text[])
        and public.payround_is_group_member(p_group_id)
        and (
          pg_catalog.lower(pg_catalog.btrim(coalesce(p_user_email, ''))) = (
            select pg_catalog.lower(pg_catalog.btrim(g.admin_email))
            from public.groups g where g.id = p_group_id
          )
          or exists (
            select 1 from public.members m
            where m.group_id = p_group_id
              and pg_catalog.lower(pg_catalog.btrim(m.member_email)) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_user_email, '')))
              and pg_catalog.lower(coalesce(m.status, '')) in ('approved','active')
          )
        )
      )
      or (
        p_group_id is not null
        and p_type = any(array[
          'join_approved','join_declined','extra_spots_approved','extra_spots_declined',
          'spot_offer','spots_changed','payment_approved','payment_declined',
          'payout_collected','group_full'
        ]::text[])
        and public.payround_is_group_admin(p_group_id)
        and exists (
          select 1 from public.members m
          where m.group_id = p_group_id
            and pg_catalog.lower(pg_catalog.btrim(m.member_email)) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_user_email, '')))
        )
      )
    ), false
  );
$$;

revoke all on function public.payround_can_insert_notification(text, text, text) from public, anon;
grant execute on function public.payround_can_insert_notification(text, text, text) to authenticated;

drop policy if exists notifications_insert_authorized on public.notifications;
create policy notifications_insert_authorized
on public.notifications for insert to authenticated
with check (public.payround_can_insert_notification(user_email, group_id, type));

-- Account review notification is part of the same transaction as approval/decline.
create or replace function public.notify_account_review_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(new.email, '')));
  v_type text;
  v_message text;
begin
  if v_email = '' then return new; end if;

  if coalesce(new.is_approved, false)
     and not coalesce(old.is_approved, false) then
    v_type := 'user_approved';
    v_message := 'Welcome! Your PayRound account has been approved.';
  elsif pg_catalog.lower(coalesce(new.approval_status, '')) = 'declined'
        and (
          pg_catalog.lower(coalesce(old.approval_status, '')) is distinct from 'declined'
          or new.decline_reason is distinct from old.decline_reason
        ) then
    v_type := 'user_declined';
    v_message := 'Your account approval was declined: '
      || coalesce(nullif(pg_catalog.btrim(new.decline_reason), ''), 'Required account information could not be verified.')
      || ' You may contact PayRound Support.';
  else
    return new;
  end if;

  insert into public.notifications (
    id, type, group_id, message, is_read, created_at, user_email
  ) values (
    'account-review-' || new.id::text || '-' || v_type || '-' || pg_catalog.txid_current()::text,
    v_type, null, v_message, false, pg_catalog.now(), v_email
  ) on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists users_notify_account_review_change on public.users;
create trigger users_notify_account_review_change
after update of is_approved, approval_status, decline_reason on public.users
for each row execute function public.notify_account_review_change();

-- Backfill one approval notice for accounts approved before this repair.
insert into public.notifications(id, type, group_id, message, is_read, created_at, user_email)
select 'account-approval-backfill-' || u.id::text,
       'user_approved', null,
       'Welcome! Your PayRound account has been approved.',
       false, pg_catalog.now(), pg_catalog.lower(pg_catalog.btrim(u.email))
from public.users u
where coalesce(u.is_approved, false)
  and nullif(pg_catalog.btrim(coalesce(u.email, '')), '') is not null
  and not exists (
    select 1 from public.notifications n
    where n.type = 'user_approved'
      and pg_catalog.lower(pg_catalog.btrim(coalesce(n.user_email, ''))) = pg_catalog.lower(pg_catalog.btrim(u.email))
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Server-enforced frozen-account and frozen-group restrictions
-- ---------------------------------------------------------------------------

create or replace function public.payround_actor_is_frozen()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select coalesce(u.is_frozen, false)
    from public.users u
    where pg_catalog.lower(pg_catalog.btrim(u.email)) = public.payround_actor_email()
    limit 1
  ), false);
$$;

revoke all on function public.payround_actor_is_frozen() from public, anon;
grant execute on function public.payround_actor_is_frozen() to authenticated;

create or replace function public.block_frozen_actor_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is not null
     and not public.payround_is_owner()
     and public.payround_actor_is_frozen() then
    raise exception 'Your PayRound account is frozen. Only approved-group admin chats and PayRound Support are available.'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Install on user-facing mutation tables. Support chat is deliberately excluded;
-- direct messages have the pair-aware guard below.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'users','groups','members','payments','payouts','member_receipts','group_messages','ads',
    'group_reviews','member_reviews','business_reviews','group_edit_requests',
    'follows','verification_requests','ad_events','notifications','notification_user_state',
    'account_deletion_requests','referral_claims','referral_payouts'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop trigger if exists block_frozen_actor_mutation on public.%I', v_table);
      execute format(
        'create trigger block_frozen_actor_mutation before insert or update or delete on public.%I for each row execute function public.block_frozen_actor_mutation()',
        v_table
      );
    end if;
  end loop;
end;
$$;

create or replace function public.block_frozen_group_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_group_id text;
  v_frozen boolean := false;
begin
  if auth.uid() is null or public.payround_is_owner() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'groups' then
    v_group_id := v_row->>'id';
    if tg_op <> 'INSERT' then
      v_frozen := coalesce((to_jsonb(old)->>'is_frozen')::boolean, false);
    end if;
  else
    v_group_id := nullif(v_row->>'group_id', '');
    if v_group_id is not null then
      select coalesce(g.is_frozen, false) into v_frozen
      from public.groups g where g.id = v_group_id;
    end if;
  end if;

  if coalesce(v_frozen, false) then
    raise exception 'This group is frozen. Joins, payments, payouts, spot changes, edits and group chat are paused.'
      using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'groups','members','payments','payouts','member_receipts','group_messages',
    'group_reviews','member_reviews','group_edit_requests'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop trigger if exists block_frozen_group_mutation on public.%I', v_table);
      execute format(
        'create trigger block_frozen_group_mutation before insert or update or delete on public.%I for each row execute function public.block_frozen_group_mutation()',
        v_table
      );
    end if;
  end loop;
end;
$$;

-- Direct chats involving a frozen account are allowed only for an approved
-- member <-> that group's admin relationship. PayRound Support is separate.
create or replace function public.payround_frozen_pair_allowed(p_from_email text, p_to_email text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_from text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_from_email, ''))), '');
  v_to text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_to_email, ''))), '');
  v_from_frozen boolean := false;
  v_to_frozen boolean := false;
begin
  if auth.uid() is null then return true; end if;
  if v_from is null or v_to is null or v_from = v_to then return false; end if;
  if public.payround_is_owner() then return true; end if;

  select coalesce(bool_or(pg_catalog.lower(pg_catalog.btrim(u.email)) = v_from and coalesce(u.is_frozen, false)), false),
         coalesce(bool_or(pg_catalog.lower(pg_catalog.btrim(u.email)) = v_to and coalesce(u.is_frozen, false)), false)
  into v_from_frozen, v_to_frozen
  from public.users u
  where pg_catalog.lower(pg_catalog.btrim(u.email)) in (v_from, v_to);

  if not v_from_frozen and not v_to_frozen then return true; end if;

  -- PayRound Support uses the separate support_threads/support_messages RPCs.
  -- Frozen direct chat is reserved strictly for admins of approved groups.
  return exists (
    select 1
    from public.members m
    join public.groups g on g.id = m.group_id
    where pg_catalog.lower(coalesce(m.status, '')) in ('approved','active')
      and (
        (v_from_frozen
          and pg_catalog.lower(pg_catalog.btrim(m.member_email)) = v_from
          and pg_catalog.lower(pg_catalog.btrim(g.admin_email)) = v_to)
        or
        (v_to_frozen
          and pg_catalog.lower(pg_catalog.btrim(m.member_email)) = v_to
          and pg_catalog.lower(pg_catalog.btrim(g.admin_email)) = v_from)
      )
  );
end;
$$;

revoke all on function public.payround_frozen_pair_allowed(text, text) from public, anon;
grant execute on function public.payround_frozen_pair_allowed(text, text) to authenticated;

create or replace function public.guard_frozen_direct_message_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.payround_frozen_pair_allowed(new.from_email, new.to_email) then
    raise exception 'This direct chat is unavailable while the account is frozen. Use an approved-group admin chat or PayRound Support.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_guard_frozen_pair on public.messages;
create trigger messages_guard_frozen_pair
before insert on public.messages
for each row execute function public.guard_frozen_direct_message_insert();

-- A frozen recipient may still acknowledge an allowed message as read. No other
-- update or deletion is permitted for a frozen actor, even through an existing
-- permissive policy or SECURITY DEFINER helper.
create or replace function public.guard_frozen_direct_message_update_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.payround_actor_email();
begin
  if auth.uid() is null
     or public.payround_is_owner()
     or not public.payround_actor_is_frozen() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE'
     and v_actor = pg_catalog.lower(pg_catalog.btrim(old.to_email))
     and public.payround_frozen_pair_allowed(old.from_email, old.to_email)
     and not coalesce(old.read, false)
     and coalesce(new.read, false)
     and (to_jsonb(new) - 'read') is not distinct from (to_jsonb(old) - 'read') then
    return new;
  end if;

  raise exception 'While frozen, messages may only be read or sent in approved-group admin chats and PayRound Support.'
    using errcode = '42501';
end;
$$;

drop trigger if exists messages_block_frozen_update_delete on public.messages;
create trigger messages_block_frozen_update_delete
before update or delete on public.messages
for each row execute function public.guard_frozen_direct_message_update_delete();

drop policy if exists messages_insert_sender on public.messages;
create policy messages_insert_sender
on public.messages for insert to authenticated
with check (
  pg_catalog.lower(pg_catalog.btrim(from_email)) = public.payround_actor_email()
  and public.payround_frozen_pair_allowed(from_email, to_email)
);

create or replace function public.get_my_direct_messages(p_other_email text default null, p_limit integer default 500)
returns setof public.messages
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select q.*
  from (
    select m.*
    from public.messages m
    where auth.uid() is not null
      and public.payround_actor_email() is not null
      and (
        pg_catalog.lower(pg_catalog.btrim(m.from_email)) = public.payround_actor_email()
        or pg_catalog.lower(pg_catalog.btrim(m.to_email)) = public.payround_actor_email()
      )
      and (
        nullif(pg_catalog.lower(pg_catalog.btrim(p_other_email)), '') is null
        or (
          pg_catalog.lower(pg_catalog.btrim(m.from_email)) in (
            public.payround_actor_email(), nullif(pg_catalog.lower(pg_catalog.btrim(p_other_email)), '')
          )
          and pg_catalog.lower(pg_catalog.btrim(m.to_email)) in (
            public.payround_actor_email(), nullif(pg_catalog.lower(pg_catalog.btrim(p_other_email)), '')
          )
          and pg_catalog.lower(pg_catalog.btrim(m.from_email)) <> pg_catalog.lower(pg_catalog.btrim(m.to_email))
        )
      )
      and (
        not public.payround_actor_is_frozen()
        or public.payround_frozen_pair_allowed(
          m.from_email,
          m.to_email
        )
      )
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
  ) q
  order by q.created_at asc;
$$;

create or replace function public.get_my_direct_message_people()
returns table(email text, id uuid, name text, profile_pic text, is_verified boolean)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with actor as (select public.payround_actor_email() as email),
  peers as (
    select pg_catalog.lower(pg_catalog.btrim(m.to_email)) as email from public.messages m, actor a
      where a.email is not null
        and pg_catalog.lower(pg_catalog.btrim(m.from_email)) = a.email
        and (not public.payround_actor_is_frozen() or public.payround_frozen_pair_allowed(m.from_email, m.to_email))
    union
    select pg_catalog.lower(pg_catalog.btrim(m.from_email)) from public.messages m, actor a
      where a.email is not null
        and pg_catalog.lower(pg_catalog.btrim(m.to_email)) = a.email
        and (not public.payround_actor_is_frozen() or public.payround_frozen_pair_allowed(m.from_email, m.to_email))
  )
  select pg_catalog.lower(pg_catalog.btrim(u.email)), u.id, u.name, u.profile_pic, coalesce(u.is_verified, false)
  from public.users u join peers p on p.email = pg_catalog.lower(pg_catalog.btrim(u.email));
$$;

create or replace function public.mark_my_direct_messages_read(p_other_email text)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.payround_actor_email();
  v_peer text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_other_email, ''))), '');
  v_count integer;
begin
  if auth.uid() is null or v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_peer is null or v_peer = v_actor then return 0; end if;
  if not public.payround_frozen_pair_allowed(v_actor, v_peer) then
    raise exception 'This direct chat is unavailable while the account is frozen' using errcode = '42501';
  end if;
  update public.messages m
  set read = true
  where pg_catalog.lower(pg_catalog.btrim(m.to_email)) = v_actor
    and pg_catalog.lower(pg_catalog.btrim(m.from_email)) = v_peer
    and not coalesce(m.read, false);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.send_my_direct_message(p_to_user_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.payround_actor_email();
  v_peer public.users%rowtype;
  v_body text := pg_catalog.btrim(coalesce(p_body, ''));
  v_id text := 'msg-' || gen_random_uuid()::text;
begin
  if auth.uid() is null or v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_body = '' or char_length(v_body) > 4000 then
    raise exception 'Message must be between 1 and 4000 characters' using errcode = '22023';
  end if;
  select * into v_peer from public.users u where u.id = p_to_user_id
    and (coalesce(u.is_approved, false) or pg_catalog.lower(coalesce(u.approval_status, '')) = 'approved');
  if not found then raise exception 'Recipient not found' using errcode = 'P0002'; end if;
  if pg_catalog.lower(pg_catalog.btrim(v_peer.email)) = v_actor then
    raise exception 'Cannot message yourself' using errcode = '22023';
  end if;
  if not public.payround_frozen_pair_allowed(v_actor, v_peer.email) then
    raise exception 'This direct chat is unavailable while the account is frozen. Use an approved-group admin chat or PayRound Support.'
      using errcode = '42501';
  end if;
  insert into public.messages(id, from_email, to_email, body)
  values(v_id, v_actor, pg_catalog.lower(pg_catalog.btrim(v_peer.email)), v_body);
  return jsonb_build_object(
    'id', v_id,
    'peer_email', pg_catalog.lower(pg_catalog.btrim(v_peer.email)),
    'peer', jsonb_build_object('id', v_peer.id, 'name', v_peer.name,
      'profile_pic', v_peer.profile_pic, 'is_verified', coalesce(v_peer.is_verified, false))
  );
end;
$$;

create or replace function public.get_direct_message_peer_context(p_peer_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.payround_actor_email();
  v_peer_email text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_peer_email, ''))), '');
  v_peer public.users%rowtype;
  v_is_admin_contact boolean := false;
  v_groups jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_peer_email is null or v_peer_email = v_actor then
    return jsonb_build_object('can_message', false);
  end if;

  select * into v_peer from public.users u
  where pg_catalog.lower(pg_catalog.btrim(u.email)) = v_peer_email
  limit 1;
  if not found then return jsonb_build_object('can_message', false); end if;

  select exists(
    select 1 from public.members m
    join public.groups g on g.id = m.group_id
    where pg_catalog.lower(pg_catalog.btrim(m.member_email)) = v_peer_email
      and pg_catalog.lower(coalesce(m.status, '')) in ('approved','active')
      and pg_catalog.lower(pg_catalog.btrim(g.admin_email)) = v_actor
  ) into v_is_admin_contact;

  if v_is_admin_contact then
    select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.name), '[]'::jsonb)
    into v_groups
    from public.members m
    join public.groups g on g.id = m.group_id
    where pg_catalog.lower(pg_catalog.btrim(m.member_email)) = v_peer_email
      and pg_catalog.lower(coalesce(m.status, '')) in ('approved','active')
      and pg_catalog.lower(pg_catalog.btrim(g.admin_email)) = v_actor;
  end if;

  return jsonb_build_object(
    'can_message', public.payround_frozen_pair_allowed(v_actor, v_peer_email),
    'peer_is_frozen', coalesce(v_peer.is_frozen, false),
    'admin_note', case when coalesce(v_peer.is_frozen, false) and (v_is_admin_contact or public.payround_is_owner()) then v_peer.freeze_admin_note else null end,
    'shared_admin_groups', v_groups
  );
end;
$$;

revoke all on function public.get_direct_message_peer_context(text) from public, anon;
grant execute on function public.get_direct_message_peer_context(text) to authenticated;

create or replace function public.get_group_member_freeze_statuses(p_group_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null
     or not (public.payround_is_owner() or public.payround_is_group_admin(p_group_id)) then
    raise exception 'Group admin access required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'member_email', pg_catalog.lower(pg_catalog.btrim(m.member_email)),
    'user_id', u.id,
    'is_frozen', coalesce(u.is_frozen, false),
    'admin_note', case when coalesce(u.is_frozen, false) then u.freeze_admin_note else null end,
    'frozen_at', case when coalesce(u.is_frozen, false) then u.frozen_at else null end
  )), '[]'::jsonb)
  into v_result
  from public.members m
  left join public.users u
    on pg_catalog.lower(pg_catalog.btrim(u.email)) = pg_catalog.lower(pg_catalog.btrim(m.member_email))
  where m.group_id = p_group_id
    and pg_catalog.lower(coalesce(m.status, '')) in ('approved','active');

  return v_result;
end;
$$;

revoke all on function public.get_group_member_freeze_statuses(text) from public, anon;
grant execute on function public.get_group_member_freeze_statuses(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Support-message RPCs (available even while the account is frozen)
-- ---------------------------------------------------------------------------

create or replace function public.send_my_support_message(p_body text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.payround_actor_email();
  v_body text := pg_catalog.btrim(coalesce(p_body, ''));
  v_thread public.support_threads%rowtype;
  v_name text;
  v_message_id text := 'sm-' || gen_random_uuid()::text;
begin
  if auth.uid() is null or v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_body = '' or char_length(v_body) > 1000 then
    raise exception 'Support message must be between 1 and 1000 characters' using errcode = '22023';
  end if;

  select coalesce(nullif(pg_catalog.btrim(u.name), ''), v_actor) into v_name
  from public.users u
  where pg_catalog.lower(pg_catalog.btrim(u.email)) = v_actor
  limit 1;
  v_name := coalesce(v_name, v_actor);

  select * into v_thread
  from public.support_threads t
  where pg_catalog.lower(pg_catalog.btrim(t.user_email)) = v_actor
  order by t.last_at desc nulls last
  limit 1
  for update;

  if not found then
    insert into public.support_threads(id, user_email, user_name, last_message, last_at, user_read, owner_read)
    values('st-' || gen_random_uuid()::text, v_actor, v_name, v_body, pg_catalog.now(), true, false)
    returning * into v_thread;
  else
    update public.support_threads t
    set user_name = v_name,
        last_message = v_body,
        last_at = pg_catalog.now(),
        user_read = true,
        owner_read = false
    where t.id = v_thread.id
    returning * into v_thread;
  end if;

  insert into public.support_messages(id, thread_id, sender_type, body, read, created_at)
  values(v_message_id, v_thread.id, 'user', v_body, false, pg_catalog.now());

  return jsonb_build_object('thread_id', v_thread.id, 'message_id', v_message_id, 'created_at', pg_catalog.now());
end;
$$;

create or replace function public.send_my_support_bot_message(p_thread_id text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.payround_actor_email();
  v_body text := pg_catalog.btrim(coalesce(p_body, ''));
  v_id text := 'sm-' || gen_random_uuid()::text;
begin
  if auth.uid() is null or v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_body = '' or char_length(v_body) > 4000 then
    raise exception 'Bot message must be between 1 and 4000 characters' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.support_threads t
    where t.id = p_thread_id
      and pg_catalog.lower(pg_catalog.btrim(t.user_email)) = v_actor
  ) then
    raise exception 'Support thread not found' using errcode = 'P0002';
  end if;

  insert into public.support_messages(id, thread_id, sender_type, body, read, created_at)
  values(v_id, p_thread_id, 'bot', v_body, true, pg_catalog.now());
  return jsonb_build_object('id', v_id, 'created_at', pg_catalog.now());
end;
$$;

create or replace function public.mark_my_support_read()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.payround_actor_email();
begin
  if auth.uid() is null or v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.support_messages m
  set read = true
  where m.sender_type = 'owner'
    and not coalesce(m.read, false)
    and exists (
      select 1 from public.support_threads t
      where t.id = m.thread_id
        and pg_catalog.lower(pg_catalog.btrim(t.user_email)) = v_actor
    );

  update public.support_threads t
  set user_read = true
  where pg_catalog.lower(pg_catalog.btrim(t.user_email)) = v_actor;

  return true;
end;
$$;

revoke all on function public.send_my_support_message(text) from public, anon;
revoke all on function public.send_my_support_bot_message(text, text) from public, anon;
revoke all on function public.mark_my_support_read() from public, anon;
grant execute on function public.send_my_support_message(text) to authenticated;
grant execute on function public.send_my_support_bot_message(text, text) to authenticated;
grant execute on function public.mark_my_support_read() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Private user/group reports and owner-only review queue
-- ---------------------------------------------------------------------------

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null,
  reporter_email text not null,
  target_type text not null check (target_type in ('user','group')),
  target_ref text not null,
  target_label text not null,
  category text not null,
  details text not null,
  status text not null default 'pending' check (status in ('pending','reviewed','resolved','dismissed')),
  owner_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_email text
);

create index if not exists reports_status_created_idx on public.reports(status, created_at desc);
create index if not exists reports_reporter_created_idx on public.reports(reporter_user_id, created_at desc);
create index if not exists reports_target_idx on public.reports(target_type, target_ref, created_at desc);

alter table public.reports enable row level security;
revoke all on table public.reports from public, anon, authenticated;

create or replace function public.submit_report(
  p_target_type text,
  p_target_id text,
  p_category text,
  p_details text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.payround_actor_email();
  v_reporter public.users%rowtype;
  v_type text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_target_type, '')));
  v_target text := pg_catalog.btrim(coalesce(p_target_id, ''));
  v_category text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_category, '')));
  v_details text := pg_catalog.btrim(coalesce(p_details, ''));
  v_target_label text;
  v_target_uuid uuid;
  v_id uuid;
begin
  if auth.uid() is null or v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if public.payround_actor_is_frozen() then
    raise exception 'Reporting is unavailable while your account is frozen. Contact PayRound Support.' using errcode = '42501';
  end if;
  if v_type not in ('user','group') then
    raise exception 'Report target must be a user or group' using errcode = '22023';
  end if;
  if v_category not in ('fraud_or_scam','harassment','fake_identity','payment_issue','unsafe_content','group_rules','other') then
    raise exception 'Choose a valid report category' using errcode = '22023';
  end if;
  if char_length(v_details) < 10 or char_length(v_details) > 2000 then
    raise exception 'Report details must be between 10 and 2000 characters' using errcode = '22023';
  end if;

  select * into v_reporter from public.users u
  where pg_catalog.lower(pg_catalog.btrim(u.email)) = v_actor
  limit 1;
  if not found then raise exception 'Reporter profile not found' using errcode = 'P0002'; end if;

  if v_type = 'user' then
    begin v_target_uuid := v_target::uuid;
    exception when invalid_text_representation then
      raise exception 'Reported user was not found' using errcode = 'P0002';
    end;
    if v_target_uuid = v_reporter.id then
      raise exception 'You cannot report your own profile' using errcode = '22023';
    end if;
    select coalesce(nullif(pg_catalog.btrim(u.name), ''), u.email), u.id::text
    into v_target_label, v_target
    from public.users u where u.id = v_target_uuid;
  else
    select coalesce(nullif(pg_catalog.btrim(g.name), ''), g.id), g.id
    into v_target_label, v_target
    from public.groups g where g.id = v_target;
  end if;
  if v_target_label is null then raise exception 'Reported target was not found' using errcode = 'P0002'; end if;

  if (select count(*) from public.reports r
      where r.reporter_user_id = v_reporter.id
        and r.created_at > pg_catalog.now() - interval '24 hours') >= 10 then
    raise exception 'You have reached today''s private report limit' using errcode = '42901';
  end if;
  if exists (
    select 1 from public.reports r
    where r.reporter_user_id = v_reporter.id
      and r.target_type = v_type
      and r.target_ref = v_target
      and r.status = 'pending'
  ) then
    raise exception 'You already have a pending report for this target' using errcode = '23505';
  end if;

  insert into public.reports(
    reporter_user_id, reporter_email, target_type, target_ref,
    target_label, category, details
  ) values (
    v_reporter.id, v_actor, v_type, v_target,
    v_target_label, v_category, v_details
  ) returning id into v_id;

  -- Deliberately no notification: reports and review status are owner-only.
  return jsonb_build_object('id', v_id, 'status', 'pending');
end;
$$;

create or replace function public.get_owner_reports()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.payround_is_owner() then
    raise exception 'PayRound owner access required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    to_jsonb(r) || jsonb_build_object(
      'reporter_name', coalesce(nullif(pg_catalog.btrim(u.name), ''), r.reporter_email),
      'reporter_profile_pic', u.profile_pic
    ) order by (r.status = 'pending') desc, r.created_at desc
  ), '[]'::jsonb)
  into v_result
  from public.reports r
  left join public.users u on u.id = r.reporter_user_id;

  return v_result;
end;
$$;

create or replace function public.owner_review_report(
  p_report_id uuid,
  p_status text,
  p_owner_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_status text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_status, '')));
  v_report public.reports%rowtype;
begin
  if auth.uid() is null or not public.payround_is_owner() then
    raise exception 'PayRound owner access required' using errcode = '42501';
  end if;
  if v_status not in ('pending','reviewed','resolved','dismissed') then
    raise exception 'Invalid report status' using errcode = '22023';
  end if;

  update public.reports r
  set status = v_status,
      owner_note = nullif(pg_catalog.btrim(coalesce(p_owner_note, '')), ''),
      reviewed_at = case when v_status = 'pending' then null else pg_catalog.now() end,
      reviewed_by_email = case when v_status = 'pending' then null else public.payround_actor_email() end
  where r.id = p_report_id
  returning r.* into v_report;
  if not found then raise exception 'Report not found' using errcode = 'P0002'; end if;

  -- Deliberately no notification to reporter or reported party.
  return to_jsonb(v_report);
end;
$$;

revoke all on function public.submit_report(text, text, text, text) from public, anon;
revoke all on function public.get_owner_reports() from public, anon;
revoke all on function public.owner_review_report(uuid, text, text) from public, anon;
grant execute on function public.submit_report(text, text, text, text) to authenticated;
grant execute on function public.get_owner_reports() to authenticated;
grant execute on function public.owner_review_report(uuid, text, text) to authenticated;

commit;
