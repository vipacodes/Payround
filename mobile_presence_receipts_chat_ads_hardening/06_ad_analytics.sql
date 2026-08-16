-- PayRound hardening — phone part 6 of 6: Protected ad-placement analytics
-- Run parts 1 through 6 in order. This part is rerunnable.

begin;

-- Replace every older policy for this table inside this same transaction.
do $drop_ad_events_policies$
declare
  v_policy record;
begin
  for v_policy in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'ad_events'
  loop
    execute format('drop policy if exists %I on public.ad_events', v_policy.policyname);
  end loop;
end
$drop_ad_events_policies$;

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
