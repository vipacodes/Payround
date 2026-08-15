-- PayRound ads authentication and ownership hotfix
-- Run in Supabase Dashboard -> SQL Editor, then deploy the matching app change.
-- Safe to run more than once.

begin;

-- JWT helpers used by the trigger and RLS policies below.
create or replace function public.ads_claim_email()
returns text
language sql
stable
security invoker
set search_path = auth, pg_catalog
as $$
  select lower(coalesce(auth.jwt()->>'email', ''))
$$;

create or replace function public.is_ads_manager()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select public.ads_claim_email() in (
    'vipadarapper@gmail.com',
    'payroundsupport@gmail.com'
  )
$$;

revoke all on function public.ads_claim_email() from public, anon;
revoke all on function public.is_ads_manager() from public, anon;
grant execute on function public.ads_claim_email() to authenticated, service_role;
grant execute on function public.is_ads_manager() to authenticated, service_role;

-- 1) Visitors must never write directly to the ads table.
alter table public.ads enable row level security;
alter table public.ads force row level security;

revoke insert, update, delete on table public.ads from public, anon;
grant select, insert, update, delete on table public.ads to authenticated;

-- Remove every legacy browser-write policy. This includes the old ads_all
-- policy whose USING (true) allowed any authenticated account to change or
-- delete another account's advert. Dedicated least-privilege policies follow.
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ads'
      and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      and (
        'public' = any(roles)
        or 'anon' = any(roles)
        or 'authenticated' = any(roles)
      )
  loop
    execute format('drop policy if exists %I on public.ads', r.policyname);
  end loop;
end $$;

-- Preserve authenticated reads required by public business/profile pages. The
-- application still limits public advertising feeds to approved adverts.
drop policy if exists ads_authenticated_read on public.ads;
create policy ads_authenticated_read
on public.ads for select to authenticated
using (true);

drop policy if exists ads_authenticated_insert_own on public.ads;
create policy ads_authenticated_insert_own
on public.ads for insert to authenticated
with check (
  auth.uid() is not null
  and lower(coalesce(submitter_email, '')) = public.ads_claim_email()
);

drop policy if exists ads_authenticated_update_own on public.ads;
create policy ads_authenticated_update_own
on public.ads for update to authenticated
using (
  auth.uid() is not null
  and (
    lower(coalesce(submitter_email, '')) = public.ads_claim_email()
    or public.is_ads_manager()
  )
)
with check (
  auth.uid() is not null
  and (
    lower(coalesce(submitter_email, '')) = public.ads_claim_email()
    or public.is_ads_manager()
  )
);

drop policy if exists ads_authenticated_delete_own on public.ads;
create policy ads_authenticated_delete_own
on public.ads for delete to authenticated
using (
  auth.uid() is not null
  and (
    lower(coalesce(submitter_email, '')) = public.ads_claim_email()
    or public.is_ads_manager()
  )
);

-- 2) The submit_ad RPC already validates auth; make Postgres reject anonymous
-- calls before its body runs as an additional server-side boundary.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_ad'
  loop
    execute format('revoke execute on function %s from public, anon', r.signature);
    execute format('grant execute on function %s to authenticated, service_role', r.signature);
  end loop;
end $$;

-- 3) Canonicalise ad ownership from the verified JWT. This protects against a
-- future app regression that accidentally sends a cached or forged email.
create or replace function public.enforce_ad_authenticated_owner()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  claim_email text := public.ads_claim_email();
  request_role text := coalesce(auth.jwt()->>'role', '');
begin
  -- Trusted service-role jobs can perform maintenance. SQL Editor maintenance
  -- has no request JWT and runs as a database administration role.
  if request_role = 'service_role' then
    return new;
  end if;
  if auth.uid() is null and current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if auth.uid() is null or claim_email = '' then
    raise exception 'Sign up free to run an ad' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    -- Even a manager creating an ad owns that new ad; browser callers cannot
    -- create an advert on behalf of an arbitrary email address.
    new.submitter_email := claim_email;
  elsif public.is_ads_manager() then
    -- Managers may moderate status/content but cannot transfer ownership.
    new.submitter_email := old.submitter_email;
  elsif lower(coalesce(old.submitter_email, '')) <> claim_email then
    raise exception 'You can only change your own ads' using errcode = '42501';
  else
    -- Ownership can never be transferred by an advertiser update.
    new.submitter_email := old.submitter_email;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_ad_authenticated_owner() from public, anon;
grant execute on function public.enforce_ad_authenticated_owner() to authenticated, service_role;

drop trigger if exists ads_authenticated_owner on public.ads;
create trigger ads_authenticated_owner
before insert or update on public.ads
for each row execute function public.enforce_ad_authenticated_owner();

-- 4) Video uploads now carry the signed-in JWT. Supabase Storage uses both
-- table grants and RLS; hosted projects may preserve managed base grants for
-- API roles, so the owner-scoped RLS policies below are the authoritative
-- write boundary. Revoke anonymous writes where the managed ACL permits it.
-- Public READ access to the public ads-media bucket remains unchanged.
revoke insert, update, delete on table storage.objects from public, anon;
grant select, insert, update, delete on table storage.objects to authenticated;

-- User-owned path used by the app: ads/<auth.uid()>/<ad id>/<filename>
-- Remove earlier ads-media write policies first so permissive OR-combination of
-- RLS policies cannot accidentally bypass the owner path checks below.
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      and (
        coalesce(qual, '') ilike '%ads-media%'
        or coalesce(with_check, '') ilike '%ads-media%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

drop policy if exists "Authenticated users upload own ad media" on storage.objects;
create policy "Authenticated users upload own ad media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'ads-media'
  and (storage.foldername(name))[1] = 'ads'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Authenticated users update own ad media" on storage.objects;
create policy "Authenticated users update own ad media"
on storage.objects for update to authenticated
using (
  bucket_id = 'ads-media'
  and (storage.foldername(name))[1] = 'ads'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'ads-media'
  and (storage.foldername(name))[1] = 'ads'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Authenticated users delete own ad media" on storage.objects;
create policy "Authenticated users delete own ad media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'ads-media'
  and (storage.foldername(name))[1] = 'ads'
  and (storage.foldername(name))[2] = auth.uid()::text
);

commit;

-- Verification (run separately if desired):
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'ads'
-- order by grantee, privilege_type;
--
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where (schemaname, tablename) in (('public', 'ads'), ('storage', 'objects'))
-- order by schemaname, tablename, policyname;
--
-- Anonymous POST /rest/v1/rpc/submit_ad should now return 401/403, anonymous
-- POST /rest/v1/ads must be denied, and authenticated cross-account UPDATE or
-- DELETE requests must affect zero rows / be denied.
