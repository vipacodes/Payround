-- PayRound: dismissing a private report permanently deletes it, plus an
-- owner-only tally of how many times each account/group has ever been reported.
-- 2026-08-17
--
-- Behaviour:
--   * owner_review_report(..., 'dismissed') now DELETES the report row.
--   * A private report_tallies table keeps the lifetime "times reported"
--     count per target, so the total survives dismissed/deleted reports.
--     It is incremented by trigger on every new report.
--   * get_owner_reports adds target_total_reports to each row.
--   * get_owner_report_tallies() lets the owner dashboard show the count
--     on any user profile. Owner-only; users can never read these numbers.
--
-- Safe to run more than once.

begin;

-- -------------------------------------------------------------------------
-- 1. PRIVATE LIFETIME TALLY (owner-only)
-- -------------------------------------------------------------------------

create table if not exists public.report_tallies (
  target_type text not null check (target_type in ('user', 'group')),
  target_ref text not null,
  total_reports integer not null default 0,
  last_reported_at timestamptz,
  primary key (target_type, target_ref)
);

alter table public.report_tallies enable row level security;
alter table public.report_tallies force row level security;
revoke all on table public.report_tallies from public, anon, authenticated;
grant all on table public.report_tallies to service_role;

comment on table public.report_tallies is
  'Private lifetime count of reports per target. Survives report dismissal/deletion. Owner-only via get_owner_report_tallies().';

create or replace function public._payround_bump_report_tally()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  insert into public.report_tallies (target_type, target_ref, total_reports, last_reported_at)
  values (new.target_type, new.target_ref, 1, coalesce(new.created_at, clock_timestamp()))
  on conflict (target_type, target_ref) do update
    set total_reports = public.report_tallies.total_reports + 1,
        last_reported_at = greatest(coalesce(public.report_tallies.last_reported_at, 'epoch'::timestamptz), coalesce(excluded.last_reported_at, clock_timestamp()));
  return new;
end;
$function$;

revoke all on function public._payround_bump_report_tally() from public, anon, authenticated;
grant execute on function public._payround_bump_report_tally() to service_role;

drop trigger if exists reports_bump_tally on public.reports;
create trigger reports_bump_tally
after insert on public.reports
for each row execute function public._payround_bump_report_tally();

-- Backfill from reports that already exist. greatest() keeps this idempotent
-- and never lowers a tally that already counted since-deleted reports.
insert into public.report_tallies (target_type, target_ref, total_reports, last_reported_at)
select r.target_type, r.target_ref, count(*), max(r.created_at)
from public.reports r
group by r.target_type, r.target_ref
on conflict (target_type, target_ref) do update
  set total_reports = greatest(public.report_tallies.total_reports, excluded.total_reports),
      last_reported_at = greatest(coalesce(public.report_tallies.last_reported_at, 'epoch'::timestamptz), coalesce(excluded.last_reported_at, 'epoch'::timestamptz));

-- -------------------------------------------------------------------------
-- 2. DISMISS = PERMANENT DELETE
-- -------------------------------------------------------------------------

create or replace function public.owner_review_report(
  p_report_id uuid,
  p_status text,
  p_owner_note text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_status text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_status, '')));
  v_report public.reports%rowtype;
begin
  if auth.uid() is null or not public.payround_is_owner() then
    raise exception 'PayRound owner access required' using errcode = '42501';
  end if;
  if v_status not in ('pending','reviewed','resolved','dismissed') then
    raise exception 'Invalid report status' using errcode = '22023';
  end if;

  -- Dismissing removes the report from the queue permanently. The lifetime
  -- tally in report_tallies is intentionally NOT decremented.
  if v_status = 'dismissed' then
    delete from public.reports r
    where r.id = p_report_id
    returning r.* into v_report;
    if not found then raise exception 'Report not found' using errcode = 'P0002'; end if;
    return jsonb_build_object('ok', true, 'deleted', true, 'id', v_report.id);
  end if;

  update public.reports r
  set status = v_status,
      owner_note = nullif(pg_catalog.btrim(coalesce(p_owner_note, '')), ''),
      reviewed_at = case when v_status = 'pending' then null else pg_catalog.now() end,
      reviewed_by_email = case when v_status = 'pending' then null else public.payround_actor_email() end
  where r.id = p_report_id
  returning r.* into v_report;
  if not found then raise exception 'Report not found' using errcode = 'P0002'; end if;

  -- Deliberately no notification to reporter or reported party.
  return to_jsonb(v_report);
end;
$function$;

-- -------------------------------------------------------------------------
-- 3. OWNER REPORTS LIST: include the lifetime tally per target
-- -------------------------------------------------------------------------

create or replace function public.get_owner_reports()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.payround_is_owner() then
    raise exception 'PayRound owner access required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    to_jsonb(r) || jsonb_build_object(
      'reporter_name', coalesce(nullif(pg_catalog.btrim(u.name), ''), r.reporter_email),
      'reporter_profile_pic', u.profile_pic,
      'reporter_user_id', coalesce(r.reporter_user_id, u.id),
      'target_total_reports', coalesce(t.total_reports, 1)
    ) order by (r.status = 'pending') desc, r.created_at desc
  ), '[]'::jsonb)
  into v_result
  from public.reports r
  left join public.users u on u.id = r.reporter_user_id
  left join public.report_tallies t
    on t.target_type = r.target_type and t.target_ref = r.target_ref;

  return v_result;
end;
$function$;

-- -------------------------------------------------------------------------
-- 4. OWNER TALLY LOOKUP (for user profiles, even with zero open reports)
-- -------------------------------------------------------------------------

create or replace function public.get_owner_report_tallies()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
begin
  if auth.uid() is null or not public.payround_is_owner() then
    raise exception 'PayRound owner access required' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'target_type', t.target_type,
      'target_ref', t.target_ref,
      'total_reports', t.total_reports,
      'last_reported_at', t.last_reported_at
    ) order by t.total_reports desc)
    from public.report_tallies t
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.get_owner_report_tallies() from public, anon;
grant execute on function public.get_owner_report_tallies() to authenticated, service_role;

commit;
