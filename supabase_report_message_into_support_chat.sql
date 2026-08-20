-- PayRound: report follow-up messages also land in the user's support chat
-- 2026-08-20
--
-- Before: owner_send_report_notification only created a bell notification.
-- Now the same message is ALSO delivered as a real PayRound Support chat
-- message (sender_type 'owner'), creating the support thread when the user
-- has none yet. The thread stays/becomes bot-muted so the auto-reply bot
-- never interferes with a report conversation, and the user sees the text
-- when they tap the notification (which deep-links into the support chat).
--
-- Safe to run more than once.

begin;

-- Internal helper: deliver an owner message into a user's support chat.
create or replace function public._payround_deliver_support_owner_message(
  p_email text,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_email text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, ''))), '');
  v_body text := pg_catalog.btrim(coalesce(p_body, ''));
  v_thread public.support_threads%rowtype;
  v_name text;
begin
  if v_email is null or v_body = '' then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email, 0));

  select * into v_thread
  from public.support_threads t
  where pg_catalog.lower(pg_catalog.btrim(t.user_email)) = v_email
  order by t.last_at desc nulls last
  limit 1
  for update;

  if not found then
    select nullif(pg_catalog.btrim(u.name), '') into v_name
    from public.users u
    where pg_catalog.lower(pg_catalog.btrim(u.email)) = v_email
    order by u.created_at nulls last
    limit 1;

    insert into public.support_threads(
      id, user_email, user_name, last_message, last_at, user_read, owner_read, bot_muted
    ) values (
      'st-' || gen_random_uuid()::text,
      v_email,
      coalesce(v_name, v_email),
      v_body,
      pg_catalog.now(),
      false,
      true,
      true
    ) returning * into v_thread;
  else
    update public.support_threads t
    set last_message = v_body,
        last_at = pg_catalog.now(),
        user_read = false,
        owner_read = true,
        bot_muted = true
    where t.id = v_thread.id;
  end if;

  insert into public.support_messages(id, thread_id, sender_type, body, read, created_at)
  values ('sm-' || gen_random_uuid()::text, v_thread.id, 'owner', v_body, false, pg_catalog.now());
end;
$function$;

revoke all on function public._payround_deliver_support_owner_message(text, text) from public, anon, authenticated;
grant execute on function public._payround_deliver_support_owner_message(text, text) to service_role;

-- Report follow-ups: bell notification + real support-chat message.
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

    -- 💬 Deliver the same text into their PayRound Support chat (bot-muted).
    perform public._payround_deliver_support_owner_message(
      v_report.reporter_email, v_message);
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

    -- 💬 Deliver the same text into their PayRound Support chat (bot-muted).
    perform public._payround_deliver_support_owner_message(
      v_reported_email, v_message);
  end if;

  return jsonb_build_object(
    'sent', v_count,
    'audience', v_audience,
    'reported_target_type', v_report.target_type
  );
end;
$function$;

commit;
