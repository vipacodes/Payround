-- PayRound message-request migration — PART 2 OF 5
-- Run after Part 1. Safe to rerun.

begin;

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

commit;
