-- PayRound presence, receipt/chat authorization, and ad analytics hardening
-- Canonical rerunnable migration. Run as the Supabase database owner.

begin;

-- ---------------------------------------------------------------------------
-- 1. JWT-derived identity helpers (never trust an email supplied by a client)
-- ---------------------------------------------------------------------------
create or replace function public.payround_actor_email()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select lower(nullif(coalesce(
    current_setting('request.jwt.claim.email', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  ), ''))
$$;

create or replace function public.payround_is_owner()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(public.payround_actor_email() = any (array[
    'vipadarapper@gmail.com'::text,
    'payroundsupport@gmail.com'::text
  ]), false)
$$;

create or replace function public.payround_is_group_admin(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(exists (
    select 1 from public.groups g
    where g.id = p_group_id
      and lower(g.admin_email) = public.payround_actor_email()
  ), false)
$$;

create or replace function public.payround_is_group_member(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(exists (
    select 1 from public.members m
    where m.group_id = p_group_id
      and lower(m.member_email) = public.payround_actor_email()
      and m.status = 'approved'
  ), false)
$$;

create or replace function public.payround_is_group_participant(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.payround_is_group_admin(p_group_id)
      or public.payround_is_group_member(p_group_id)
$$;

create or replace function public.payround_group_chat_open(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((select g.chat_open from public.groups g where g.id = p_group_id), false)
$$;

create or replace function public.payround_owns_payment(p_payment_id text, p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(exists (
    select 1 from public.payments p
    where p.id = p_payment_id
      and p.group_id = p_group_id
      and lower(p.user_email) = public.payround_actor_email()
  ), false)
$$;

revoke all on function public.payround_actor_email() from public, anon;
revoke all on function public.payround_is_owner() from public, anon;
revoke all on function public.payround_is_group_admin(text) from public, anon;
revoke all on function public.payround_is_group_member(text) from public, anon;
revoke all on function public.payround_is_group_participant(text) from public, anon;
revoke all on function public.payround_group_chat_open(text) from public, anon;
revoke all on function public.payround_owns_payment(text, text) from public, anon;
grant execute on function public.payround_actor_email() to authenticated, service_role;
grant execute on function public.payround_is_owner() to authenticated, service_role;
grant execute on function public.payround_is_group_admin(text) to authenticated, service_role;
grant execute on function public.payround_is_group_member(text) to authenticated, service_role;
grant execute on function public.payround_is_group_participant(text) to authenticated, service_role;
grant execute on function public.payround_group_chat_open(text) to authenticated, service_role;
grant execute on function public.payround_owns_payment(text, text) to authenticated, service_role;

-- Drop every old client policy on the four hardened event/content tables.
do $drop_old_policies$
declare
  v_table text;
  v_policy record;
begin
  foreach v_table in array array['payments', 'messages', 'group_messages', 'ad_events'] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'Required table public.% is missing', v_table;
    end if;
    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = v_table
    loop
      execute format('drop policy if exists %I on public.%I', v_policy.policyname, v_table);
    end loop;
  end loop;
end
$drop_old_policies$;

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

-- ---------------------------------------------------------------------------
-- 5. Private user presence and owner-only online list
-- ---------------------------------------------------------------------------
create table if not exists public.user_presence (
  user_id uuid primary key references public.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_presence_last_seen_idx
  on public.user_presence(last_seen_at desc);

alter table public.user_presence enable row level security;
alter table public.user_presence force row level security;
revoke all on table public.user_presence from public, anon, authenticated;
grant select on table public.user_presence to authenticated;

drop policy if exists user_presence_owner_select on public.user_presence;
create policy user_presence_owner_select
on public.user_presence for select to authenticated
using (public.payround_is_owner());

create or replace function public.touch_user_presence()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
begin
  if public.payround_actor_email() is null then
    raise exception 'Authentication required';
  end if;
  select u.id into v_user_id
  from public.users u
  where lower(u.email) = public.payround_actor_email()
  limit 1;
  if v_user_id is null then
    return false;
  end if;
  insert into public.user_presence(user_id, last_seen_at, updated_at)
  values (v_user_id, now(), now())
  on conflict (user_id) do update
    set last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at;
  return true;
end;
$$;

create or replace function public.get_owner_online_users()
returns table (
  user_id uuid,
  email text,
  name text,
  profile_pic text,
  is_verified boolean,
  last_seen_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.payround_is_owner() then
    raise exception 'Owner authorization required';
  end if;
  return query
  select u.id, lower(u.email), u.name, u.profile_pic, coalesce(u.is_verified, false), p.last_seen_at
  from public.user_presence p
  join public.users u on u.id = p.user_id
  where p.last_seen_at >= now() - interval '75 seconds'
  order by p.last_seen_at desc, u.name nulls last;
end;
$$;

revoke all on function public.touch_user_presence() from public, anon;
revoke all on function public.get_owner_online_users() from public, anon;
grant execute on function public.touch_user_presence() to authenticated, service_role;
grant execute on function public.get_owner_online_users() to authenticated, service_role;

-- Enable Realtime invalidation when the standard Supabase publication exists.
do $presence_realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication p
       join pg_publication_rel pr on pr.prpubid = p.oid
       join pg_class c on c.oid = pr.prrelid
       join pg_namespace n on n.oid = c.relnamespace
       where p.pubname = 'supabase_realtime'
         and n.nspname = 'public'
         and c.relname = 'user_presence'
     ) then
    alter publication supabase_realtime add table public.user_presence;
  end if;
end
$presence_realtime$;

-- ---------------------------------------------------------------------------
-- 6. Server-authorized ad-placement analytics
-- ---------------------------------------------------------------------------
alter table public.ad_events enable row level security;
alter table public.ad_events force row level security;
revoke all on table public.ad_events from public, anon, authenticated;
do $protect_ad_event_sequence$
declare
  v_sequence text := pg_get_serial_sequence('public.ad_events', 'id');
begin
  if v_sequence is not null then
    execute format('revoke all on sequence %s from public, anon, authenticated', v_sequence);
  end if;
end
$protect_ad_event_sequence$;
create index if not exists ad_events_ad_created_idx
  on public.ad_events(ad_id, created_at desc);

create or replace function public.get_ad_analytics(p_ad_id text)
returns table (
  kind text,
  media_index integer,
  viewer text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ad public.ads%rowtype;
  v_actor text := public.payround_actor_email();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;
  select * into v_ad from public.ads where id = p_ad_id;
  if not found then
    raise exception 'Ad not found';
  end if;
  if not public.payround_is_owner() and lower(v_ad.submitter_email) <> v_actor then
    raise exception 'You may only view analytics for your own ad';
  end if;
  if not public.payround_is_owner()
     and (v_ad.expires_at is null or v_ad.expires_at > now())
     and v_ad.status <> 'archived' then
    raise exception 'Advertiser analytics become available after the ad run ends';
  end if;

  return query
  select e.kind,
         e.media_index,
         case
           when e.viewer like 'a:%' then e.viewer
           when e.viewer like 'g:%' then e.viewer
           else null
         end,
         e.created_at
  from public.ad_events e
  where e.ad_id = v_ad.id
  order by e.created_at asc;
end;
$$;

revoke all on function public.get_ad_analytics(text) from public, anon;
grant execute on function public.get_ad_analytics(text) to authenticated, service_role;

-- pgcrypto may live in public or extensions. Discover it once and generate a
-- wrapper whose digest reference is schema-qualified (safe in SECURITY DEFINER).
do $create_sha256_wrapper$
declare
  v_digest_oid oid := coalesce(
    to_regprocedure('public.digest(text,text)'),
    to_regprocedure('extensions.digest(text,text)')
  );
  v_digest_schema text;
begin
  if v_digest_oid is null then
    raise exception 'pgcrypto digest(text,text) is required';
  end if;
  select n.nspname into v_digest_schema
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.oid = v_digest_oid;

  execute format($wrapper$
    create or replace function public.payround_sha256(p_value text)
    returns text
    language plpgsql
    immutable
    security definer
    set search_path = pg_catalog
    as $body$
    begin
      return encode(%I.digest(p_value, 'sha256'), 'hex');
    end;
    $body$
  $wrapper$, v_digest_schema);
end
$create_sha256_wrapper$;
revoke all on function public.payround_sha256(text) from public, anon, authenticated;

-- Rebind the event RPC to the schema-independent hash wrapper.
create or replace function public.record_ad_event(
  p_ad_id text,
  p_kind text,
  p_media_index integer default null,
  p_viewer_token text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ad public.ads%rowtype;
  v_actor text := public.payround_actor_email();
  v_viewer text;
begin
  if p_kind not in ('view', 'click') then
    raise exception 'Invalid ad event kind';
  end if;
  if p_media_index is not null and (p_media_index < 0 or p_media_index > 1000) then
    raise exception 'Invalid media index';
  end if;
  select * into v_ad from public.ads where id = p_ad_id;
  if not found
     or v_ad.status <> 'approved'
     or (v_ad.approved_at is not null and v_ad.approved_at > now())
     or (v_ad.expires_at is not null and v_ad.expires_at < now()) then
    return false;
  end if;
  if v_actor is not null then
    v_viewer := 'a:' || public.payround_sha256(v_actor);
    if lower(v_ad.submitter_email) = v_actor then return false; end if;
  else
    if p_viewer_token is null or p_viewer_token !~ '^g:[a-zA-Z0-9_-]{8,96}$' then
      return false;
    end if;
    v_viewer := 'g:' || public.payround_sha256(p_viewer_token);
  end if;
  insert into public.ad_events(ad_id, kind, media_index, viewer, created_at)
  values (v_ad.id, p_kind, p_media_index, v_viewer, now());
  return true;
end;
$$;
revoke all on function public.record_ad_event(text, text, integer, text) from public;
grant execute on function public.record_ad_event(text, text, integer, text) to anon, authenticated, service_role;

commit;
