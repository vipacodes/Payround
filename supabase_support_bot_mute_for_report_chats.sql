-- PayRound: the support bot stays silent in report-related conversations
-- 2026-08-20
--
-- When PayRound contacts a user about a report (owner_send_report_notification),
-- that user's support conversation becomes a human-only matter:
--   * support_threads.bot_muted is set for the recipient(s).
--   * send_my_support_bot_message refuses to insert a bot reply for a muted
--     thread, and also when the user received a report-related PayRound
--     message in the last 14 days (covers threads created after the notice).
--     It returns {"muted": true} instead of raising, so the user app simply
--     shows no bot bubble.
--   * The owner can mute/unmute the bot per thread from the Support Chats tab.
--
-- Safe to run more than once.

begin;

-- -------------------------------------------------------------------------
-- 1. PER-THREAD BOT MUTE FLAG
-- -------------------------------------------------------------------------

alter table public.support_threads
  add column if not exists bot_muted boolean not null default false;

comment on column public.support_threads.bot_muted is
  'True = the auto-reply bot must stay silent in this conversation (human-only matter, e.g. a report). Set automatically by report notifications; the owner can toggle it.';

-- -------------------------------------------------------------------------
-- 2. BOT SEND RPC: refuse report-related conversations
-- -------------------------------------------------------------------------

create or replace function public.send_my_support_bot_message(p_thread_id text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
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

  -- 🤖🔇 Human-only conversations: no bot reply when the thread is muted, or
  -- when PayRound recently contacted this user about a report. The team
  -- answers personally instead.
  if exists (
    select 1 from public.support_threads t
    where t.id = p_thread_id
      and pg_catalog.lower(pg_catalog.btrim(t.user_email)) = v_actor
      and t.bot_muted
  ) or exists (
    select 1 from public.notifications n
    where pg_catalog.lower(pg_catalog.btrim(coalesce(n.user_email, ''))) = v_actor
      and n.type = 'owner_report_message'
      and n.created_at > pg_catalog.now() - interval '14 days'
  ) then
    -- Keep the thread muted from now on so the state is visible to the owner.
    update public.support_threads t
    set bot_muted = true
    where t.id = p_thread_id
      and pg_catalog.lower(pg_catalog.btrim(t.user_email)) = v_actor
      and not t.bot_muted;
    return jsonb_build_object('muted', true);
  end if;

  insert into public.support_messages(id, thread_id, sender_type, body, read, created_at)
  values(v_id, p_thread_id, 'bot', v_body, true, pg_catalog.now());
  return jsonb_build_object('id', v_id, 'created_at', pg_catalog.now());
end;
$function$;

-- -------------------------------------------------------------------------
-- 3. REPORT NOTIFICATIONS ALSO MUTE THE RECIPIENT'S SUPPORT THREAD
-- -------------------------------------------------------------------------

create or replace function public.owner_send_report_notification(p_report_id uuid, p_audience text, p_message text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
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

    -- 🤖🔇 This conversation is now a human matter — mute the bot.
    update public.support_threads t
    set bot_muted = true
    where pg_catalog.lower(pg_catalog.btrim(t.user_email)) = pg_catalog.lower(pg_catalog.btrim(v_report.reporter_email))
      and not t.bot_muted;
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

    -- 🤖🔇 This conversation is now a human matter — mute the bot.
    update public.support_threads t
    set bot_muted = true
    where pg_catalog.lower(pg_catalog.btrim(t.user_email)) = v_reported_email
      and not t.bot_muted;
  end if;

  return jsonb_build_object(
    'sent', v_count,
    'audience', v_audience,
    'reported_target_type', v_report.target_type
  );
end;
$function$;

commit;
