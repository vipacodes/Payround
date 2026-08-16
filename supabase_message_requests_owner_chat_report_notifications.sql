-- PayRound: direct-message requests, owner profile chat, and optional report notices
-- Rerunnable production migration (2026-08-16)
-- Run after supabase_notifications_freeze_reports.sql.

begin;

-- ---------------------------------------------------------------------------
-- 1. One-message direct-chat requests
-- ---------------------------------------------------------------------------

create table if not exists public.direct_message_requests (
  id uuid primary key default gen_random_uuid(),
  participant_low uuid not null references public.users(id) on delete cascade,
  participant_high uuid not null references public.users(id) on delete cascade,
  requester_user_id uuid not null references public.users(id) on delete cascade,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  first_message_id text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint direct_message_requests_distinct_users check (participant_low <> participant_high),
  constraint direct_message_requests_ordered_pair check (participant_low < participant_high),
  constraint direct_message_requests_pair_unique unique (participant_low, participant_high),
  constraint direct_message_requests_direction check (
    requester_user_id in (participant_low, participant_high)
    and recipient_user_id in (participant_low, participant_high)
    and requester_user_id <> recipient_user_id
  )
);

create index if not exists direct_message_requests_requester_idx
  on public.direct_message_requests(requester_user_id, status, created_at desc);
create index if not exists direct_message_requests_recipient_idx
  on public.direct_message_requests(recipient_user_id, status, created_at desc);

alter table public.direct_message_requests enable row level security;
revoke all on table public.direct_message_requests from public, anon, authenticated;

-- Preserve established conversations. A historical two-way conversation is
-- accepted; a historical one-way conversation becomes a pending request and
-- its existing first message is the request message.
with resolved as (
  select
    m.id,
    m.created_at,
    sender.id as sender_id,
    recipient.id as recipient_id,
    least(sender.id, recipient.id) as participant_low,
    greatest(sender.id, recipient.id) as participant_high
  from public.messages m
  join public.users sender
    on pg_catalog.lower(pg_catalog.btrim(sender.email)) = pg_catalog.lower(pg_catalog.btrim(m.from_email))
  join public.users recipient
    on pg_catalog.lower(pg_catalog.btrim(recipient.email)) = pg_catalog.lower(pg_catalog.btrim(m.to_email))
  where sender.id <> recipient.id
), summarized as (
  select
    participant_low,
    participant_high,
    (array_agg(sender_id order by created_at asc nulls first, id asc))[1] as requester_user_id,
    (array_agg(id order by created_at asc nulls first, id asc))[1] as first_message_id,
    min(created_at) as created_at,
    bool_or(sender_id = participant_low) as low_sent,
    bool_or(sender_id = participant_high) as high_sent
  from resolved
  group by participant_low, participant_high
)
insert into public.direct_message_requests(
  participant_low, participant_high, requester_user_id, recipient_user_id,
  status, first_message_id, created_at, responded_at
)
select
  participant_low,
  participant_high,
  requester_user_id,
  case when requester_user_id = participant_low then participant_high else participant_low end,
  case
    when low_sent and high_sent then 'accepted'
    -- Group administrators can contact their approved/active members without
    -- waiting for a request response, including for historical one-way chats.
    when exists (
      select 1
      from public.users requester
      join public.users recipient
        on recipient.id = case when summarized.requester_user_id = summarized.participant_low
          then summarized.participant_high else summarized.participant_low end
      join public.groups g
        on pg_catalog.lower(pg_catalog.btrim(g.admin_email)) = pg_catalog.lower(pg_catalog.btrim(requester.email))
      join public.members m
        on m.group_id = g.id
       and pg_catalog.lower(pg_catalog.btrim(m.member_email)) = pg_catalog.lower(pg_catalog.btrim(recipient.email))
       and pg_catalog.lower(coalesce(m.status, '')) in ('approved','active')
      where requester.id = summarized.requester_user_id
    ) then 'accepted'
    else 'pending'
  end,
  first_message_id,
  coalesce(created_at, pg_catalog.now()),
  case
    when low_sent and high_sent then pg_catalog.now()
    when exists (
      select 1
      from public.users requester
      join public.users recipient
        on recipient.id = case when summarized.requester_user_id = summarized.participant_low
          then summarized.participant_high else summarized.participant_low end
      join public.groups g
        on pg_catalog.lower(pg_catalog.btrim(g.admin_email)) = pg_catalog.lower(pg_catalog.btrim(requester.email))
      join public.members m
        on m.group_id = g.id
       and pg_catalog.lower(pg_catalog.btrim(m.member_email)) = pg_catalog.lower(pg_catalog.btrim(recipient.email))
       and pg_catalog.lower(coalesce(m.status, '')) in ('approved','active')
      where requester.id = summarized.requester_user_id
    ) then pg_catalog.now()
    else null
  end
from summarized
on conflict (participant_low, participant_high) do nothing;

-- Also upgrades an already-created pending request when its requester is the
-- current administrator of an approved/active member. This makes reruns and
-- partially deployed copies converge to the same rule.
update public.direct_message_requests r
set status = 'accepted',
    responded_at = coalesce(r.responded_at, pg_catalog.now())
from public.users requester, public.users recipient
where r.status = 'pending'
  and requester.id = r.requester_user_id
  and recipient.id = r.recipient_user_id
  and exists (
    select 1
    from public.groups g
    join public.members m on m.group_id = g.id
    where pg_catalog.lower(pg_catalog.btrim(g.admin_email)) = pg_catalog.lower(pg_catalog.btrim(requester.email))
      and pg_catalog.lower(pg_catalog.btrim(m.member_email)) = pg_catalog.lower(pg_catalog.btrim(recipient.email))
      and pg_catalog.lower(coalesce(m.status, '')) in ('approved','active')
  );

-- Every authenticated direct-message insert passes this trigger, including old
-- clients that still insert into messages directly. The trigger binds the
-- sender to the JWT and allows exactly one message until the recipient accepts.
create or replace function public.guard_direct_message_request_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.payround_actor_email();
  v_sender public.users%rowtype;
  v_recipient public.users%rowtype;
  v_request public.direct_message_requests%rowtype;
  v_low uuid;
  v_high uuid;
begin
  -- Database-owner maintenance has no end-user JWT and is not a user chat.
  if auth.uid() is null then return new; end if;
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  new.from_email := pg_catalog.lower(pg_catalog.btrim(coalesce(new.from_email, '')));
  new.to_email := pg_catalog.lower(pg_catalog.btrim(coalesce(new.to_email, '')));
  new.body := pg_catalog.btrim(coalesce(new.body, ''));

  if new.from_email <> v_actor then
    raise exception 'Message sender must match the signed-in account' using errcode = '42501';
  end if;
  if new.body = '' or char_length(new.body) > 4000 then
    raise exception 'Message must be between 1 and 4000 characters' using errcode = '22023';
  end if;

  select * into v_sender
  from public.users u
  where pg_catalog.lower(pg_catalog.btrim(u.email)) = new.from_email
  limit 1;
  if not found then raise exception 'Sender profile not found' using errcode = 'P0002'; end if;

  select * into v_recipient
  from public.users u
  where pg_catalog.lower(pg_catalog.btrim(u.email)) = new.to_email
    and (coalesce(u.is_approved, false) or pg_catalog.lower(coalesce(u.approval_status, '')) = 'approved')
  limit 1;
  if not found then raise exception 'Recipient not found' using errcode = 'P0002'; end if;
  if v_sender.id = v_recipient.id then
    raise exception 'Cannot message yourself' using errcode = '22023';
  end if;

  v_low := least(v_sender.id, v_recipient.id);
  v_high := greatest(v_sender.id, v_recipient.id);

  insert into public.direct_message_requests(
    participant_low, participant_high, requester_user_id, recipient_user_id, status
  ) values (
    v_low, v_high, v_sender.id, v_recipient.id, 'pending'
  ) on conflict (participant_low, participant_high) do nothing;

  select * into v_request
  from public.direct_message_requests r
  where r.participant_low = v_low and r.participant_high = v_high
  for update;

  if v_request.status = 'accepted' then return new; end if;

  -- An administrator may start or continue a direct conversation with an
  -- approved/active member of a group they administer without waiting. The
  -- accepted pair then behaves as a normal two-way conversation.
  if exists (
    select 1
    from public.groups g
    join public.members m on m.group_id = g.id
    where pg_catalog.lower(pg_catalog.btrim(g.admin_email)) = new.from_email
      and pg_catalog.lower(pg_catalog.btrim(m.member_email)) = new.to_email
      and pg_catalog.lower(coalesce(m.status, '')) in ('approved','active')
  ) then
    update public.direct_message_requests
    set status = 'accepted', responded_at = coalesce(responded_at, pg_catalog.now())
    where id = v_request.id;
    return new;
  end if;

  if v_request.status = 'pending' and v_request.requester_user_id = v_sender.id then
    if v_request.first_message_id is null then
      update public.direct_message_requests
      set first_message_id = new.id
      where id = v_request.id;
      return new;
    end if;
    raise exception 'Message request pending. You can send another message after the recipient accepts.'
      using errcode = '42501';
  end if;

  if v_request.status = 'pending' and v_request.recipient_user_id = v_sender.id then
    raise exception 'Accept this message request before replying.' using errcode = '42501';
  end if;

  raise exception 'This message request was declined. The recipient must accept it before messaging can continue.'
    using errcode = '42501';
end;
$$;

drop trigger if exists messages_guard_request_state on public.messages;
create trigger messages_guard_request_state
before insert on public.messages
for each row execute function public.guard_direct_message_request_insert();

create or replace function public.get_direct_message_request_context(p_peer_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.payround_actor_email();
  v_peer_email text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_peer_email, ''))), '');
  v_actor_user public.users%rowtype;
  v_peer public.users%rowtype;
  v_request public.direct_message_requests%rowtype;
  v_role text := 'none';
  v_can_send boolean := true;
  v_can_respond boolean := false;
begin
  if auth.uid() is null or v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_peer_email is null or v_peer_email = v_actor then
    return jsonb_build_object('status', 'unavailable', 'role', 'none', 'can_send', false, 'can_respond', false);
  end if;

  select * into v_actor_user from public.users u
  where pg_catalog.lower(pg_catalog.btrim(u.email)) = v_actor limit 1;
  if not found then raise exception 'Sender profile not found' using errcode = 'P0002'; end if;

  select * into v_peer from public.users u
  where pg_catalog.lower(pg_catalog.btrim(u.email)) = v_peer_email limit 1;
  if not found then
    return jsonb_build_object('status', 'unavailable', 'role', 'none', 'can_send', false, 'can_respond', false);
  end if;

  select * into v_request from public.direct_message_requests r
  where r.participant_low = least(v_actor_user.id, v_peer.id)
    and r.participant_high = greatest(v_actor_user.id, v_peer.id);

  if not found then
    return jsonb_build_object(
      'status', 'none', 'role', 'requester', 'can_send', true, 'can_respond', false,
      'peer_email', v_peer_email, 'peer_user_id', v_peer.id
    );
  end if;

  v_role := case when v_request.requester_user_id = v_actor_user.id then 'requester' else 'recipient' end;
  v_can_send := v_request.status = 'accepted'
    or (v_request.status = 'pending' and v_role = 'requester' and v_request.first_message_id is null);
  v_can_respond := v_role = 'recipient' and v_request.status in ('pending','declined');

  return jsonb_build_object(
    'id', v_request.id,
    'status', v_request.status,
    'role', v_role,
    'can_send', v_can_send,
    'can_respond', v_can_respond,
    'first_message_id', v_request.first_message_id,
    'created_at', v_request.created_at,
    'responded_at', v_request.responded_at,
    'peer_email', v_peer_email,
    'peer_user_id', v_peer.id
  );
end;
$$;

-- Keep request-only peers discoverable even if the requester later deletes the
-- first message. This preserves the recipient's Accept/Decline controls and
-- does not weaken frozen-account visibility rules.
create or replace function public.get_my_direct_message_people()
returns table(email text, id uuid, name text, profile_pic text, is_verified boolean)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with actor as (
    select u.id, pg_catalog.lower(pg_catalog.btrim(u.email)) as email
    from public.users u
    where auth.uid() is not null
      and pg_catalog.lower(pg_catalog.btrim(u.email)) = public.payround_actor_email()
    limit 1
  ), peers as (
    select pg_catalog.lower(pg_catalog.btrim(m.to_email)) as email
    from public.messages m, actor a
    where pg_catalog.lower(pg_catalog.btrim(m.from_email)) = a.email
      and (not public.payround_actor_is_frozen() or public.payround_frozen_pair_allowed(m.from_email, m.to_email))
    union
    select pg_catalog.lower(pg_catalog.btrim(m.from_email))
    from public.messages m, actor a
    where pg_catalog.lower(pg_catalog.btrim(m.to_email)) = a.email
      and (not public.payround_actor_is_frozen() or public.payround_frozen_pair_allowed(m.from_email, m.to_email))
    union
    select pg_catalog.lower(pg_catalog.btrim(peer.email))
    from public.direct_message_requests r
    join actor a on a.id in (r.participant_low, r.participant_high)
    join public.users peer on peer.id = case when r.participant_low = a.id then r.participant_high else r.participant_low end
    where not public.payround_actor_is_frozen()
       or public.payround_frozen_pair_allowed(a.email, peer.email)
  )
  select pg_catalog.lower(pg_catalog.btrim(u.email)), u.id, u.name, u.profile_pic, coalesce(u.is_verified, false)
  from public.users u join peers p on p.email = pg_catalog.lower(pg_catalog.btrim(u.email));
$$;

create or replace function public.get_my_direct_message_requests()
returns table(
  id uuid,
  peer_email text,
  peer_user_id uuid,
  status text,
  request_role text,
  can_send boolean,
  can_respond boolean,
  first_message_id text,
  created_at timestamptz,
  responded_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with actor as (
    select u.id, pg_catalog.lower(pg_catalog.btrim(u.email)) as email
    from public.users u
    where auth.uid() is not null
      and pg_catalog.lower(pg_catalog.btrim(u.email)) = public.payround_actor_email()
    limit 1
  )
  select
    r.id,
    pg_catalog.lower(pg_catalog.btrim(peer.email)) as peer_email,
    peer.id as peer_user_id,
    r.status,
    case when r.requester_user_id = a.id then 'requester' else 'recipient' end as request_role,
    (
      r.status = 'accepted'
      or (r.status = 'pending' and r.requester_user_id = a.id and r.first_message_id is null)
    ) as can_send,
    (r.recipient_user_id = a.id and r.status in ('pending','declined')) as can_respond,
    r.first_message_id,
    r.created_at,
    r.responded_at
  from public.direct_message_requests r
  join actor a on a.id in (r.participant_low, r.participant_high)
  join public.users peer on peer.id = case when r.participant_low = a.id then r.participant_high else r.participant_low end
  order by r.created_at desc;
$$;

create or replace function public.respond_to_direct_message_request(p_request_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.payround_actor_email();
  v_actor_user public.users%rowtype;
  v_request public.direct_message_requests%rowtype;
  v_status text;
begin
  if auth.uid() is null or v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_accept is null then raise exception 'Choose accept or decline' using errcode = '22023'; end if;

  select * into v_actor_user from public.users u
  where pg_catalog.lower(pg_catalog.btrim(u.email)) = v_actor limit 1;
  if not found then raise exception 'Profile not found' using errcode = 'P0002'; end if;

  select * into v_request from public.direct_message_requests r
  where r.id = p_request_id for update;
  if not found then raise exception 'Message request not found' using errcode = 'P0002'; end if;
  if v_request.recipient_user_id <> v_actor_user.id then
    raise exception 'Only the message recipient can answer this request' using errcode = '42501';
  end if;

  if p_accept then
    v_status := 'accepted';
  else
    if v_request.status = 'accepted' then
      raise exception 'An accepted conversation cannot be declined here' using errcode = '22023';
    end if;
    v_status := 'declined';
  end if;

  update public.direct_message_requests
  set status = v_status, responded_at = pg_catalog.now()
  where id = v_request.id
  returning * into v_request;

  return jsonb_build_object(
    'id', v_request.id,
    'status', v_request.status,
    'role', 'recipient',
    'can_send', v_request.status = 'accepted',
    'can_respond', v_request.status = 'declined',
    'first_message_id', v_request.first_message_id,
    'created_at', v_request.created_at,
    'responded_at', v_request.responded_at
  );
end;
$$;

-- All direct sends use the same request-enforcing messages trigger. The RPC
-- returns the new request state so the UI locks immediately after message one.
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
  v_request jsonb;
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

  v_request := public.get_direct_message_request_context(v_peer.email);
  return jsonb_build_object(
    'id', v_id,
    'peer_email', pg_catalog.lower(pg_catalog.btrim(v_peer.email)),
    'peer', jsonb_build_object('id', v_peer.id, 'name', v_peer.name,
      'profile_pic', v_peer.profile_pic, 'is_verified', coalesce(v_peer.is_verified, false)),
    'request', v_request
  );
end;
$$;

revoke all on function public.guard_direct_message_request_insert() from public, anon, authenticated;
revoke all on function public.get_direct_message_request_context(text) from public, anon;
revoke all on function public.get_my_direct_message_people() from public, anon;
revoke all on function public.get_my_direct_message_requests() from public, anon;
revoke all on function public.respond_to_direct_message_request(uuid, boolean) from public, anon;
revoke all on function public.send_my_direct_message(uuid, text) from public, anon;
grant execute on function public.get_direct_message_request_context(text) to authenticated;
grant execute on function public.get_my_direct_message_people() to authenticated;
grant execute on function public.get_my_direct_message_requests() to authenticated;
grant execute on function public.respond_to_direct_message_request(uuid, boolean) to authenticated;
grant execute on function public.send_my_direct_message(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Owner can open PayRound Support chat from every user profile
-- ---------------------------------------------------------------------------

create or replace function public.owner_open_user_support_chat(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user public.users%rowtype;
  v_thread public.support_threads%rowtype;
  v_email text;
begin
  if auth.uid() is null or not public.payround_is_owner() then
    raise exception 'PayRound owner access required' using errcode = '42501';
  end if;

  select * into v_user from public.users u where u.id = p_user_id;
  if not found then raise exception 'User profile not found' using errcode = 'P0002'; end if;
  v_email := pg_catalog.lower(pg_catalog.btrim(v_user.email));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email, 0));

  select * into v_thread
  from public.support_threads t
  where pg_catalog.lower(pg_catalog.btrim(t.user_email)) = v_email
  order by t.last_at desc nulls last
  limit 1
  for update;

  if not found then
    insert into public.support_threads(
      id, user_email, user_name, last_message, last_at, user_read, owner_read
    ) values (
      'st-' || gen_random_uuid()::text,
      v_email,
      coalesce(nullif(pg_catalog.btrim(v_user.name), ''), v_email),
      '',
      pg_catalog.now(),
      true,
      true
    ) returning * into v_thread;
  else
    update public.support_threads t
    set user_name = coalesce(nullif(pg_catalog.btrim(v_user.name), ''), v_email),
        owner_read = true
    where t.id = v_thread.id
    returning * into v_thread;
  end if;

  return to_jsonb(v_thread);
end;
$$;

revoke all on function public.owner_open_user_support_chat(uuid) from public, anon;
grant execute on function public.owner_open_user_support_chat(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Optional owner-written notifications from the private report queue
-- ---------------------------------------------------------------------------

create or replace function public.owner_send_report_notification(
  p_report_id uuid,
  p_audience text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_report public.reports%rowtype;
  v_audience text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_audience, '')));
  v_message text := pg_catalog.btrim(coalesce(p_message, ''));
  v_reported_email text;
  v_reported_group_id text;
  v_reporter_name text;
  v_count integer := 0;
begin
  if auth.uid() is null or not public.payround_is_owner() then
    raise exception 'PayRound owner access required' using errcode = '42501';
  end if;
  if v_audience not in ('reporter','reported','both') then
    raise exception 'Choose reporter, reported, or both' using errcode = '22023';
  end if;
  if char_length(v_message) < 2 or char_length(v_message) > 1000 then
    raise exception 'Notification text must be between 2 and 1000 characters' using errcode = '22023';
  end if;

  select * into v_report from public.reports r where r.id = p_report_id;
  if not found then raise exception 'Report not found' using errcode = 'P0002'; end if;

  select nullif(pg_catalog.lower(pg_catalog.btrim(u.name)), '') into v_reporter_name
  from public.users u where u.id = v_report.reporter_user_id;

  if v_report.target_type = 'user' then
    select pg_catalog.lower(pg_catalog.btrim(u.email)) into v_reported_email
    from public.users u where u.id = v_report.target_ref::uuid;
  else
    select pg_catalog.lower(pg_catalog.btrim(g.admin_email)), g.id
    into v_reported_email, v_reported_group_id
    from public.groups g where g.id = v_report.target_ref;
  end if;

  if v_audience in ('reported','both') and v_reported_email is null then
    raise exception 'The reported profile no longer has a notification recipient' using errcode = 'P0002';
  end if;

  -- The function never composes content from the private report. It also blocks
  -- obvious accidental disclosure when the reported party is selected. The UI
  -- adds a second explicit warning because free-form evidence cannot be safely
  -- classified by a database string check alone.
  if v_audience in ('reported','both') and (
    pg_catalog.strpos(pg_catalog.lower(v_message), pg_catalog.lower(pg_catalog.btrim(v_report.reporter_email))) > 0
    or (char_length(coalesce(v_reporter_name, '')) >= 3
      and pg_catalog.strpos(pg_catalog.lower(v_message), v_reporter_name) > 0)
    or (char_length(pg_catalog.btrim(v_report.details)) >= 10
      and pg_catalog.strpos(pg_catalog.lower(v_message), pg_catalog.lower(pg_catalog.btrim(v_report.details))) > 0)
  ) then
    raise exception 'Remove reporter identity and private report evidence before notifying the reported party'
      using errcode = '22023';
  end if;

  if v_audience in ('reporter','both') then
    insert into public.notifications(id, type, group_id, message, is_read, created_at, user_email)
    values(
      'owner-report-message-' || gen_random_uuid()::text,
      'owner_report_message',
      null,
      '💬 PayRound: ' || v_message,
      false,
      pg_catalog.now(),
      pg_catalog.lower(pg_catalog.btrim(v_report.reporter_email))
    );
    v_count := v_count + 1;
  end if;

  if v_audience in ('reported','both')
     and not (v_audience = 'both'
       and v_reported_email = pg_catalog.lower(pg_catalog.btrim(v_report.reporter_email))) then
    insert into public.notifications(id, type, group_id, message, is_read, created_at, user_email)
    values(
      'owner-report-message-' || gen_random_uuid()::text,
      'owner_report_message',
      v_reported_group_id,
      '💬 PayRound: ' || v_message,
      false,
      pg_catalog.now(),
      v_reported_email
    );
    v_count := v_count + 1;
  end if;

  return jsonb_build_object(
    'sent', v_count,
    'audience', v_audience,
    'reported_target_type', v_report.target_type
  );
end;
$$;

revoke all on function public.owner_send_report_notification(uuid, text, text) from public, anon;
grant execute on function public.owner_send_report_notification(uuid, text, text) to authenticated;

commit;
