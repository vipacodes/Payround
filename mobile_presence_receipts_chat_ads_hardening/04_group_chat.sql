-- PayRound hardening — phone part 4 of 6: Group-chat moderation
-- Run parts 1 through 6 in order. This part is rerunnable.

begin;

-- Replace every older policy for this table inside this same transaction.
do $drop_group_messages_policies$
declare
  v_policy record;
begin
  for v_policy in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'group_messages'
  loop
    execute format('drop policy if exists %I on public.group_messages', v_policy.policyname);
  end loop;
end
$drop_group_messages_policies$;

-- ---------------------------------------------------------------------------
-- 4. Group chat moderation and receipt protection
-- ---------------------------------------------------------------------------
alter table public.group_messages enable row level security;
alter table public.group_messages force row level security;
revoke all on table public.group_messages from public, anon;
grant select, insert, update, delete on table public.group_messages to authenticated;

create policy group_messages_select_participants
on public.group_messages for select to authenticated
using (public.payround_is_owner() or public.payround_is_group_participant(group_id));

create policy group_messages_insert_participants
on public.group_messages for insert to authenticated
with check (
  lower(from_email) = public.payround_actor_email()
  and (
    public.payround_is_owner()
    or public.payround_is_group_admin(group_id)
    or (
      public.payround_is_group_member(group_id)
      and (
        (payment_id is null and public.payround_group_chat_open(group_id))
        or (payment_id is not null and public.payround_owns_payment(payment_id, group_id))
      )
    )
  )
);

create policy group_messages_update_admin_receipt_stamp
on public.group_messages for update to authenticated
using (public.payround_is_owner() or public.payround_is_group_admin(group_id))
with check (public.payround_is_owner() or public.payround_is_group_admin(group_id));

create policy group_messages_delete_authorized
on public.group_messages for delete to authenticated
using (
  payment_id is null
  and (
    public.payround_is_owner()
    or public.payround_is_group_admin(group_id)
    or (
      lower(from_email) = public.payround_actor_email()
      and public.payround_is_group_member(group_id)
      and public.payround_group_chat_open(group_id)
    )
  )
);

create or replace function public.guard_group_message_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if public.payround_actor_email() is null then
    return new;
  end if;
  if (public.payround_is_owner() or public.payround_is_group_admin(old.group_id))
     and old.payment_id is not null
     and new.receipt_status in ('pending', 'approved', 'declined', 'cancelled')
     and new.id is not distinct from old.id
     and new.group_id is not distinct from old.group_id
     and new.from_email is not distinct from old.from_email
     and new.body is not distinct from old.body
     and new.created_at is not distinct from old.created_at
     and new.image_url is not distinct from old.image_url
     and new.payment_id is not distinct from old.payment_id then
    return new;
  end if;
  raise exception 'Only a receipt status stamp may be updated in group chat';
end;
$$;

revoke all on function public.guard_group_message_update() from public, anon, authenticated;
drop trigger if exists guard_group_message_update_trigger on public.group_messages;
create trigger guard_group_message_update_trigger
before update on public.group_messages
for each row execute function public.guard_group_message_update();

commit;
