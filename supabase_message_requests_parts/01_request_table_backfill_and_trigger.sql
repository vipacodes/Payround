-- PayRound message-request migration — PART 1 OF 5
-- Run this whole file first. Safe to rerun.

begin;

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

commit;
