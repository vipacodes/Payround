-- PayRound message-request migration — PART 3 OF 5
-- Run after Part 2. Safe to rerun.

begin;

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

commit;
