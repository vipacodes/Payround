-- PayRound hardening — phone part 2 of 6: Secure receipt deletion
-- Run parts 1 through 6 in order. This part is rerunnable.

begin;

-- Replace every older policy for this table inside this same transaction.
do $drop_payments_policies$
declare
  v_policy record;
begin
  for v_policy in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'payments'
  loop
    execute format('drop policy if exists %I on public.payments', v_policy.policyname);
  end loop;
end
$drop_payments_policies$;

-- ---------------------------------------------------------------------------
-- 2. Payments / receipts
-- ---------------------------------------------------------------------------
alter table public.payments enable row level security;
alter table public.payments force row level security;
revoke all on table public.payments from public, anon;
grant select, insert, update, delete on table public.payments to authenticated;

-- Approved participants retain group-wide SELECT so the shared paid-week tracker works.
create policy payments_select_participants
on public.payments for select to authenticated
using (
  public.payround_is_owner()
  or lower(user_email) = public.payround_actor_email()
  or public.payround_is_group_participant(group_id)
);

create policy payments_insert_own
on public.payments for insert to authenticated
with check (
  lower(user_email) = public.payround_actor_email()
  and status = 'pending'
  and public.payround_is_group_participant(group_id)
);

create policy payments_update_admin
on public.payments for update to authenticated
using (public.payround_is_owner() or public.payround_is_group_admin(group_id))
with check (public.payround_is_owner() or public.payround_is_group_admin(group_id));

-- Compatibility for an older client: a member may only cancel their own pending row.
create policy payments_update_own_pending_cancel
on public.payments for update to authenticated
using (lower(user_email) = public.payround_actor_email() and status = 'pending')
with check (lower(user_email) = public.payround_actor_email() and status = 'cancelled');

create policy payments_delete_authorized
on public.payments for delete to authenticated
using (
  public.payround_is_owner()
  or public.payround_is_group_admin(group_id)
  or (lower(user_email) = public.payround_actor_email() and status <> 'approved')
);

create or replace function public.guard_payment_client_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Database-owner maintenance and migrations are not client writes.
  if public.payround_actor_email() is null then
    return new;
  end if;

  if public.payround_is_owner() then
    return new;
  end if;

  if public.payround_is_group_admin(old.group_id) then
    if old.status <> 'pending'
       or new.status is null
       or new.status not in ('approved', 'declined') then
      raise exception 'Group administrators may only review pending receipts';
    end if;
    if new.id is distinct from old.id
       or new.group_id is distinct from old.group_id
       or new.member_id is distinct from old.member_id
       or new.user_email is distinct from old.user_email
       or new.member_name is distinct from old.member_name
       or new.spots is distinct from old.spots
       or new.amount is distinct from old.amount
       or new.receipt_url is distinct from old.receipt_url
       or new.created_at is distinct from old.created_at
       or new.weeks is null
       or new.weeks < 1
       or new.weeks > old.weeks then
      raise exception 'Receipt identity, evidence and claimed value are immutable during review';
    end if;
    return new;
  end if;

  if lower(old.user_email) = public.payround_actor_email()
     and old.status = 'pending'
     and new.status = 'cancelled'
     and new.id is not distinct from old.id
     and new.group_id is not distinct from old.group_id
     and new.member_id is not distinct from old.member_id
     and new.user_email is not distinct from old.user_email
     and new.member_name is not distinct from old.member_name
     and new.spots is not distinct from old.spots
     and new.weeks is not distinct from old.weeks
     and new.amount is not distinct from old.amount
     and new.receipt_url is not distinct from old.receipt_url
     and new.decline_reason is not distinct from old.decline_reason
     and new.created_at is not distinct from old.created_at
     and new.reviewed_at is not distinct from old.reviewed_at
     and new.review_note is not distinct from old.review_note then
    return new;
  end if;

  raise exception 'This payment update is not allowed';
end;
$$;

revoke all on function public.guard_payment_client_update() from public, anon, authenticated;
drop trigger if exists guard_payment_client_update_trigger on public.payments;
create trigger guard_payment_client_update_trigger
before update on public.payments
for each row execute function public.guard_payment_client_update();

-- Any authorized payment deletion atomically removes its receipt chat row. If the
-- receipt was approved, the member is also told that their paid credit was removed.
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

  if old.status = 'approved' then
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
drop trigger if exists after_payment_receipt_delete_trigger on public.payments;
create trigger after_payment_receipt_delete_trigger
after delete on public.payments
for each row execute function public.after_payment_receipt_delete();

create or replace function public.delete_group_payment_receipt(p_payment_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payment public.payments%rowtype;
  v_actor text := public.payround_actor_email();
  v_admin boolean;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;
  if nullif(btrim(p_payment_id), '') is null then
    raise exception 'A receipt ID is required';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Receipt not found';
  end if;

  v_admin := public.payround_is_owner() or public.payround_is_group_admin(v_payment.group_id);
  if not v_admin and lower(v_payment.user_email) <> v_actor then
    raise exception 'You may only delete your own receipt';
  end if;
  if not v_admin and v_payment.status = 'approved' then
    raise exception 'Approved receipts cannot be deleted or cancelled by members';
  end if;

  delete from public.payments where id = v_payment.id;
  return jsonb_build_object(
    'deleted', true,
    'payment_id', v_payment.id,
    'status', v_payment.status,
    'approved_credit_removed', v_payment.status = 'approved',
    'deleted_by_admin', v_admin
  );
end;
$$;

revoke all on function public.delete_group_payment_receipt(text) from public, anon;
grant execute on function public.delete_group_payment_receipt(text) to authenticated, service_role;

commit;
