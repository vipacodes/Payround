-- PayRound completed contribution-cycle reuse
-- Archives the completed cycle for audit, clears only active-cycle rows, and
-- keeps the group identity and unexpired creation-fee lifecycle intact.

begin;

alter table public.groups
  add column if not exists cycle_number integer not null default 1;

alter table public.groups
  add column if not exists cycle_started_at timestamptz;

update public.groups
set cycle_started_at = coalesce(cycle_started_at, created_at, now())
where cycle_started_at is null;

alter table public.groups
  alter column cycle_started_at set default now(),
  alter column cycle_started_at set not null;

-- New groups always begin at cycle 1. Existing group-update guards already stop
-- ordinary authenticated clients from changing these server-owned columns.
create or replace function public.guard_group_cycle_metadata()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.cycle_number := 1;
    new.cycle_started_at := coalesce(new.created_at, now());
  end if;
  return new;
end;
$$;

revoke all on function public.guard_group_cycle_metadata() from public, anon, authenticated;

drop trigger if exists guard_group_cycle_metadata_trigger on public.groups;
create trigger guard_group_cycle_metadata_trigger
before insert on public.groups
for each row execute function public.guard_group_cycle_metadata();

create table if not exists public.group_cycle_archives (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  cycle_number integer not null check (cycle_number > 0),
  group_snapshot jsonb not null,
  member_count integer not null default 0,
  payment_count integer not null default 0,
  payout_count integer not null default 0,
  receipt_message_count integer not null default 0,
  archived_at timestamptz not null default now(),
  archived_by_email text not null,
  unique (group_id, cycle_number)
);

create table if not exists public.group_cycle_member_archive (
  id bigint generated always as identity primary key,
  archive_id uuid not null references public.group_cycle_archives(id) on delete cascade,
  original_id text not null,
  row_data jsonb not null,
  unique (archive_id, original_id)
);

create table if not exists public.group_cycle_payment_archive (
  id bigint generated always as identity primary key,
  archive_id uuid not null references public.group_cycle_archives(id) on delete cascade,
  original_id text not null,
  row_data jsonb not null,
  unique (archive_id, original_id)
);

create table if not exists public.group_cycle_payout_archive (
  id bigint generated always as identity primary key,
  archive_id uuid not null references public.group_cycle_archives(id) on delete cascade,
  original_id text not null,
  row_data jsonb not null,
  unique (archive_id, original_id)
);

create table if not exists public.group_cycle_receipt_message_archive (
  id bigint generated always as identity primary key,
  archive_id uuid not null references public.group_cycle_archives(id) on delete cascade,
  original_id text not null,
  row_data jsonb not null,
  unique (archive_id, original_id)
);

create index if not exists group_cycle_archives_group_idx
  on public.group_cycle_archives (group_id, cycle_number desc);
create index if not exists group_cycle_member_archive_parent_idx
  on public.group_cycle_member_archive (archive_id);
create index if not exists group_cycle_payment_archive_parent_idx
  on public.group_cycle_payment_archive (archive_id);
create index if not exists group_cycle_payout_archive_parent_idx
  on public.group_cycle_payout_archive (archive_id);
create index if not exists group_cycle_receipt_message_archive_parent_idx
  on public.group_cycle_receipt_message_archive (archive_id);

alter table public.group_cycle_archives enable row level security;
alter table public.group_cycle_member_archive enable row level security;
alter table public.group_cycle_payment_archive enable row level security;
alter table public.group_cycle_payout_archive enable row level security;
alter table public.group_cycle_receipt_message_archive enable row level security;

drop policy if exists group_cycle_archives_authorized_read on public.group_cycle_archives;
create policy group_cycle_archives_authorized_read
on public.group_cycle_archives for select to authenticated
using (public.payround_is_owner() or public.payround_is_group_admin(group_id));

drop policy if exists group_cycle_member_archive_authorized_read on public.group_cycle_member_archive;
create policy group_cycle_member_archive_authorized_read
on public.group_cycle_member_archive for select to authenticated
using (
  public.payround_is_owner()
  or exists (
    select 1 from public.group_cycle_archives a
    where a.id = archive_id and public.payround_is_group_admin(a.group_id)
  )
);

drop policy if exists group_cycle_payment_archive_authorized_read on public.group_cycle_payment_archive;
create policy group_cycle_payment_archive_authorized_read
on public.group_cycle_payment_archive for select to authenticated
using (
  public.payround_is_owner()
  or exists (
    select 1 from public.group_cycle_archives a
    where a.id = archive_id and public.payround_is_group_admin(a.group_id)
  )
);

drop policy if exists group_cycle_payout_archive_authorized_read on public.group_cycle_payout_archive;
create policy group_cycle_payout_archive_authorized_read
on public.group_cycle_payout_archive for select to authenticated
using (
  public.payround_is_owner()
  or exists (
    select 1 from public.group_cycle_archives a
    where a.id = archive_id and public.payround_is_group_admin(a.group_id)
  )
);

drop policy if exists group_cycle_receipt_message_archive_authorized_read on public.group_cycle_receipt_message_archive;
create policy group_cycle_receipt_message_archive_authorized_read
on public.group_cycle_receipt_message_archive for select to authenticated
using (
  public.payround_is_owner()
  or exists (
    select 1 from public.group_cycle_archives a
    where a.id = archive_id and public.payround_is_group_admin(a.group_id)
  )
);

revoke all on table public.group_cycle_archives from anon, authenticated;
revoke all on table public.group_cycle_member_archive from anon, authenticated;
revoke all on table public.group_cycle_payment_archive from anon, authenticated;
revoke all on table public.group_cycle_payout_archive from anon, authenticated;
revoke all on table public.group_cycle_receipt_message_archive from anon, authenticated;
grant select on table public.group_cycle_archives to authenticated;
grant select on table public.group_cycle_member_archive to authenticated;
grant select on table public.group_cycle_payment_archive to authenticated;
grant select on table public.group_cycle_payout_archive to authenticated;
grant select on table public.group_cycle_receipt_message_archive to authenticated;

-- Internal authoritative completion calculation. It deliberately uses the same
-- spot/week model as the app: every spot contributes for N rounds; admin-held
-- spots count as complete when admin auto-paid is enabled.
create or replace function public.payround_group_cycle_rollover_status_internal(p_group_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group public.groups%rowtype;
  v_max integer;
  v_allocated_distinct integer := 0;
  v_allocated_instances integer := 0;
  v_invalid_spots integer := 0;
  v_paid_spots integer := 0;
  v_collected_payouts integer := 0;
  v_pending_receipts integer := 0;
  v_pending_edits integer := 0;
  v_fee_valid boolean := false;
  v_live boolean := false;
  v_blockers text[] := array[]::text[];
begin
  select g.* into v_group
  from public.groups g
  where g.id = p_group_id;

  if not found then
    return jsonb_build_object(
      'eligible', false,
      'group_id', p_group_id,
      'blockers', jsonb_build_array('Group not found.')
    );
  end if;

  v_max := coalesce(v_group.max_members, 0);
  v_fee_valid := v_group.expiry_at is not null and v_group.expiry_at > now();
  v_live := lower(coalesce(v_group.status, '')) in ('active', 'approved')
            and not coalesce(v_group.is_frozen, false);

  with parsed as (
    select case
             when btrim(token) ~ '^[0-9]+$' then btrim(token)::integer
             else null
           end as spot
    from public.members m
    cross join lateral regexp_split_to_table(coalesce(m.spots, ''), ',') token
    where m.group_id = p_group_id
      and lower(coalesce(m.status, '')) = 'approved'
      and btrim(token) <> ''
  )
  select
    count(distinct spot) filter (where spot between 1 and v_max),
    count(*) filter (where spot between 1 and v_max),
    count(*) filter (where spot is null or spot < 1 or spot > v_max)
  into v_allocated_distinct, v_allocated_instances, v_invalid_spots
  from parsed;

  if v_max > 0 then
    select count(*)
    into v_paid_spots
    from generate_series(1, v_max) wanted(spot)
    where
      (
        coalesce(v_group.admin_auto_paid, true)
        and exists (
          select 1
          from public.members m
          where m.group_id = p_group_id
            and lower(coalesce(m.status, '')) = 'approved'
            and lower(btrim(m.member_email)) = lower(btrim(v_group.admin_email))
            and exists (
              select 1
              from regexp_split_to_table(coalesce(m.spots, ''), ',') token
              where btrim(token) ~ '^[0-9]+$'
                and btrim(token)::integer = wanted.spot
            )
        )
      )
      or coalesce((
        select sum(greatest(coalesce(p.weeks, 1), 0))
        from public.payments p
        where p.group_id = p_group_id
          and lower(coalesce(p.status, '')) = 'approved'
          and exists (
            select 1
            from regexp_split_to_table(coalesce(p.spots, ''), ',') token
            where btrim(token) ~ '^[0-9]+$'
              and btrim(token)::integer = wanted.spot
          )
      ), 0) >= v_max;
  end if;

  select count(distinct p.spot)
  into v_collected_payouts
  from public.payouts p
  where p.group_id = p_group_id
    and lower(coalesce(p.status, '')) = 'collected'
    and p.spot between 1 and v_max;

  select count(*)
  into v_pending_receipts
  from public.payments p
  where p.group_id = p_group_id
    and lower(coalesce(p.status, '')) = 'pending';

  select count(*)
  into v_pending_edits
  from public.group_edit_requests r
  where r.group_id = p_group_id
    and lower(coalesce(r.status, '')) = 'pending';

  if not v_live then
    v_blockers := array_append(v_blockers, 'The group must be active and unfrozen.');
  end if;
  if not v_fee_valid then
    v_blockers := array_append(v_blockers, 'The group creation fee has expired. Renew it before starting another contribution.');
  end if;
  if v_max < 1 then
    v_blockers := array_append(v_blockers, 'The group does not have a valid number of spots.');
  elsif v_allocated_distinct <> v_max or v_allocated_instances <> v_max or v_invalid_spots > 0 then
    v_blockers := array_append(v_blockers, format('All %s spots must be allocated exactly once.', v_max));
  end if;
  if v_paid_spots <> v_max then
    v_blockers := array_append(v_blockers, format('Every spot must be paid for all %s contribution rounds.', v_max));
  end if;
  if v_collected_payouts <> v_max then
    v_blockers := array_append(v_blockers, format('All %s spot payouts must be marked collected.', v_max));
  end if;
  if v_pending_receipts > 0 then
    v_blockers := array_append(v_blockers, format('Review or decline the %s pending receipt(s) first.', v_pending_receipts));
  end if;
  if v_pending_edits > 0 then
    v_blockers := array_append(v_blockers, format('Wait for or cancel the %s pending group edit request(s) first.', v_pending_edits));
  end if;

  return jsonb_build_object(
    'eligible', coalesce(array_length(v_blockers, 1), 0) = 0,
    'group_id', v_group.id,
    'cycle_number', v_group.cycle_number,
    'next_cycle_number', v_group.cycle_number + 1,
    'cycle_started_at', v_group.cycle_started_at,
    'fee_expires_at', v_group.expiry_at,
    'fee_valid', v_fee_valid,
    'group_live', v_live,
    'max_spots', v_max,
    'allocated_spots', v_allocated_distinct,
    'allocated_spot_entries', v_allocated_instances,
    'invalid_spots', v_invalid_spots,
    'contribution_ready_spots', v_paid_spots,
    'required_rounds_per_spot', v_max,
    'collected_payouts', v_collected_payouts,
    'pending_receipts', v_pending_receipts,
    'pending_edit_requests', v_pending_edits,
    'blockers', to_jsonb(v_blockers)
  );
end;
$$;

revoke all on function public.payround_group_cycle_rollover_status_internal(text) from public, anon, authenticated;

create or replace function public.get_group_cycle_rollover_status(p_group_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.payround_actor_email();
  v_admin text;
begin
  if auth.uid() is null or v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select lower(btrim(g.admin_email)) into v_admin
  from public.groups g
  where g.id = p_group_id;

  if v_admin is null or v_admin <> v_actor then
    raise exception 'Only the group administrator can check cycle reuse' using errcode = '42501';
  end if;

  return public.payround_group_cycle_rollover_status_internal(p_group_id);
end;
$$;

revoke all on function public.get_group_cycle_rollover_status(text) from public, anon;
grant execute on function public.get_group_cycle_rollover_status(text) to authenticated;

-- Normal admin receipt deletion must still warn the member that approved credit
-- was removed. A completed-cycle archive is different, so the rollover RPC sets
-- a transaction-local marker that suppresses only that misleading warning.
create or replace function public.after_payment_receipt_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group_name text;
begin
  delete from public.group_messages where payment_id = old.id;

  if old.status = 'approved'
     and coalesce(current_setting('payround.cycle_rollover', true), 'off') <> 'on' then
    select g.name into v_group_name from public.groups g where g.id = old.group_id;
    insert into public.notifications (
      id, type, group_id, message, is_read, created_at, user_email
    ) values (
      'payment-credit-removed-' || old.id || '-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
      'payment_credit_removed',
      old.group_id,
      '⚠️ An approved receipt for ₦' || coalesce(old.amount, 0)::text || ' in "' || coalesce(v_group_name, 'your group') || '" was deleted by the group administrator. Its paid credit has been removed, so the contribution is no longer marked as paid.',
      false,
      now(),
      lower(old.user_email)
    );
  end if;

  return old;
end;
$$;

revoke all on function public.after_payment_receipt_delete() from public, anon, authenticated;

create or replace function public.start_new_group_cycle(p_group_id text, p_confirm boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.payround_actor_email();
  v_group public.groups%rowtype;
  v_status jsonb;
  v_archive_id uuid;
  v_member_count integer := 0;
  v_payment_count integer := 0;
  v_payout_count integer := 0;
  v_message_count integer := 0;
  v_notified_count integer := 0;
  v_former_email text;
begin
  if auth.uid() is null or v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_confirm is distinct from true then
    raise exception 'Explicit confirmation is required before starting a new contribution cycle' using errcode = '22023';
  end if;

  -- Authorize before taking the short write locks, then re-check under lock.
  select g.* into v_group
  from public.groups g
  where g.id = p_group_id;

  if not found or lower(btrim(v_group.admin_email)) <> v_actor then
    raise exception 'Only the group administrator can start a new cycle' using errcode = '42501';
  end if;

  -- Prevent a receipt/member/payout/edit write from slipping between completion
  -- verification and the archive/reset. These locks are transaction-scoped and
  -- held only for this short RPC.
  lock table public.members, public.payments, public.payouts,
             public.group_messages, public.group_edit_requests
    in share row exclusive mode;

  select g.* into v_group
  from public.groups g
  where g.id = p_group_id
  for update;

  if not found or lower(btrim(v_group.admin_email)) <> v_actor then
    raise exception 'Only the group administrator can start a new cycle' using errcode = '42501';
  end if;

  v_status := public.payround_group_cycle_rollover_status_internal(p_group_id);
  if not coalesce((v_status ->> 'eligible')::boolean, false) then
    raise exception 'This contribution is not ready for a new cycle: %',
      coalesce(v_status -> 'blockers', '[]'::jsonb)::text
      using errcode = '55000';
  end if;

  insert into public.group_cycle_archives (
    group_id, cycle_number, group_snapshot, archived_by_email
  ) values (
    p_group_id, v_group.cycle_number, to_jsonb(v_group), v_actor
  ) returning id into v_archive_id;

  insert into public.group_cycle_member_archive (archive_id, original_id, row_data)
  select v_archive_id, m.id, to_jsonb(m)
  from public.members m
  where m.group_id = p_group_id;
  get diagnostics v_member_count = row_count;

  insert into public.group_cycle_payment_archive (archive_id, original_id, row_data)
  select v_archive_id, p.id, to_jsonb(p)
  from public.payments p
  where p.group_id = p_group_id;
  get diagnostics v_payment_count = row_count;

  insert into public.group_cycle_payout_archive (archive_id, original_id, row_data)
  select v_archive_id, p.id, to_jsonb(p)
  from public.payouts p
  where p.group_id = p_group_id;
  get diagnostics v_payout_count = row_count;

  insert into public.group_cycle_receipt_message_archive (archive_id, original_id, row_data)
  select v_archive_id, gm.id, to_jsonb(gm)
  from public.group_messages gm
  where gm.group_id = p_group_id
    and gm.payment_id is not null;
  get diagnostics v_message_count = row_count;

  update public.group_cycle_archives
  set member_count = v_member_count,
      payment_count = v_payment_count,
      payout_count = v_payout_count,
      receipt_message_count = v_message_count
  where id = v_archive_id;

  -- Suppress only the normal "approved credit was deleted" warning. The data is
  -- archived, and former members receive the accurate new-cycle notification.
  perform set_config('payround.cycle_rollover', 'on', true);

  delete from public.payments where group_id = p_group_id;
  delete from public.group_messages
    where group_id = p_group_id and payment_id is not null;
  delete from public.payouts where group_id = p_group_id;
  delete from public.members where group_id = p_group_id;

  update public.groups
  set cycle_number = v_group.cycle_number + 1,
      cycle_started_at = now()
  where id = p_group_id;

  for v_former_email in
    select distinct lower(btrim(a.row_data ->> 'member_email'))
    from public.group_cycle_member_archive a
    where a.archive_id = v_archive_id
      and lower(coalesce(a.row_data ->> 'status', '')) in ('approved', 'active')
      and nullif(btrim(a.row_data ->> 'member_email'), '') is not null
  loop
    insert into public.notifications (
      id, type, group_id, message, is_read, created_at, user_email
    ) values (
      'cycle-restarted-' || v_archive_id::text || '-' || md5(v_former_email),
      'cycle_restarted',
      p_group_id,
      '🔄 A new contribution has started in "' || coalesce(v_group.name, 'your group') || '". Previous spots and receipts were safely closed with the completed cycle. No old spot was carried over — open the group, select the spot(s) you want for this contribution, and wait for the admin to approve or allocate them.',
      false,
      now(),
      v_former_email
    );
    v_notified_count := v_notified_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'group_id', p_group_id,
    'archived_cycle_number', v_group.cycle_number,
    'cycle_number', v_group.cycle_number + 1,
    'archive_id', v_archive_id,
    'archived_members', v_member_count,
    'archived_payments', v_payment_count,
    'archived_payouts', v_payout_count,
    'archived_receipt_messages', v_message_count,
    'notified_former_members', v_notified_count
  );
end;
$$;

revoke all on function public.start_new_group_cycle(text, boolean) from public, anon;
grant execute on function public.start_new_group_cycle(text, boolean) to authenticated;

comment on column public.groups.cycle_number is
  'Active contribution cycle number. Incremented only by start_new_group_cycle after authoritative completion checks.';
comment on column public.groups.cycle_started_at is
  'Timestamp when the active contribution cycle was opened. The rotation still begins only when all spots fill.';
comment on table public.group_cycle_archives is
  'Immutable audit header for completed contribution cycles removed from active group views.';
comment on function public.get_group_cycle_rollover_status(text) is
  'Authenticated group-admin-only authoritative eligibility and progress for completed-cycle reuse.';
comment on function public.start_new_group_cycle(text, boolean) is
  'Authenticated group-admin-only transaction that archives a completed cycle and opens the next cycle without carrying allocations or receipts.';

commit;
