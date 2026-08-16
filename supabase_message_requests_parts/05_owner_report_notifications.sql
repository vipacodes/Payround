-- PayRound message-request migration — PART 5 OF 5
-- Run after Part 4. Safe to rerun.

begin;

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
