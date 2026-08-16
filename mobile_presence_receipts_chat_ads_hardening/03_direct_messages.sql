-- PayRound hardening — phone part 3 of 6: Direct-message protection
-- Run parts 1 through 6 in order. This part is rerunnable.

begin;

-- Replace every older policy for this table inside this same transaction.
do $drop_messages_policies$
declare
  v_policy record;
begin
  for v_policy in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'messages'
  loop
    execute format('drop policy if exists %I on public.messages', v_policy.policyname);
  end loop;
end
$drop_messages_policies$;

-- ---------------------------------------------------------------------------
-- 3. Direct messages: participants may read, recipients may mark read, only the
-- sender may delete. Owner access preserves support/retention operations.
-- ---------------------------------------------------------------------------
alter table public.messages enable row level security;
alter table public.messages force row level security;
revoke all on table public.messages from public, anon;
grant select, insert, update, delete on table public.messages to authenticated;

create policy messages_select_participants
on public.messages for select to authenticated
using (
  public.payround_is_owner()
  or lower(from_email) = public.payround_actor_email()
  or lower(to_email) = public.payround_actor_email()
);

create policy messages_insert_sender
on public.messages for insert to authenticated
with check (lower(from_email) = public.payround_actor_email());

create policy messages_update_recipient_read
on public.messages for update to authenticated
using (public.payround_is_owner() or lower(to_email) = public.payround_actor_email())
with check (public.payround_is_owner() or lower(to_email) = public.payround_actor_email());

create policy messages_delete_sender
on public.messages for delete to authenticated
using (public.payround_is_owner() or lower(from_email) = public.payround_actor_email());

create or replace function public.guard_direct_message_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if public.payround_actor_email() is null or public.payround_is_owner() then
    return new;
  end if;
  if lower(old.to_email) = public.payround_actor_email()
     and new.read = true
     and new.id is not distinct from old.id
     and new.from_email is not distinct from old.from_email
     and new.to_email is not distinct from old.to_email
     and new.body is not distinct from old.body
     and new.created_at is not distinct from old.created_at then
    return new;
  end if;
  raise exception 'Recipients may only mark a direct message as read';
end;
$$;

revoke all on function public.guard_direct_message_update() from public, anon, authenticated;
drop trigger if exists guard_direct_message_update_trigger on public.messages;
create trigger guard_direct_message_update_trigger
before update on public.messages
for each row execute function public.guard_direct_message_update();

commit;
