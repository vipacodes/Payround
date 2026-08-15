-- Read-only verification after Ads Security Parts 1 and 2.
-- It does not insert, update, or delete data.
with verification as (
  select
    (
      not has_table_privilege('anon', 'public.ads', 'insert')
      and not has_table_privilege('anon', 'public.ads', 'update')
      and not has_table_privilege('anon', 'public.ads', 'delete')
    ) as anonymous_ads_writes_blocked,
    (
      has_table_privilege('authenticated', 'public.ads', 'insert')
      and has_table_privilege('authenticated', 'public.ads', 'update')
      and has_table_privilege('authenticated', 'public.ads', 'delete')
    ) as authenticated_ads_access_present,
    (
      select relrowsecurity and relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'ads'
    ) as ads_rls_enabled_and_forced,
    (
      select count(*) = 4
      from pg_policies
      where schemaname = 'public'
        and tablename = 'ads'
        and policyname in (
          'ads_authenticated_read',
          'ads_authenticated_insert_own',
          'ads_authenticated_update_own',
          'ads_authenticated_delete_own'
        )
        and roles = array['authenticated'::name]
    ) as owner_scoped_ads_policies_ok,
    (
      not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'ads'
          and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
          and roles && array['public'::name, 'anon'::name]
      )
    ) as legacy_ads_write_policies_absent,
    (
      exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'submit_ad'
      )
      and not exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'submit_ad'
          and has_function_privilege('anon', p.oid, 'execute')
      )
      and not exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'submit_ad'
          and not has_function_privilege('authenticated', p.oid, 'execute')
      )
    ) as submit_ad_rpc_access_ok,
    (
      to_regprocedure('public.ads_claim_email()') is not null
      and to_regprocedure('public.is_ads_manager()') is not null
      and to_regprocedure('public.enforce_ad_authenticated_owner()') is not null
      and (
        select count(*) = 1
        from pg_trigger
        where tgname = 'ads_authenticated_owner'
          and not tgisinternal
          and tgenabled <> 'D'
      )
    ) as ownership_helpers_and_trigger_ok,
    (
      select relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'storage' and c.relname = 'objects'
    ) as storage_rls_enabled,
    (
      select count(*) = 3
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname in (
          'Authenticated users upload own ad media',
          'Authenticated users update own ad media',
          'Authenticated users delete own ad media'
        )
        and roles = array['authenticated'::name]
    ) as owner_scoped_storage_policies_ok,
    (
      not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
          and roles && array['public'::name, 'anon'::name]
          and (
            coalesce(qual, '') ilike '%ads-media%'
            or coalesce(with_check, '') ilike '%ads-media%'
          )
      )
    ) as legacy_storage_write_policies_absent,
    (select count(*) from public.ads) as ads_row_count,
    (select count(*) from storage.objects where bucket_id = 'ads-media') as ads_media_object_count
)
select item as verification_item, result
from verification as v
cross join lateral (
  values
    ('01_anonymous_ads_writes_blocked', v.anonymous_ads_writes_blocked::text),
    ('02_authenticated_ads_access_present', v.authenticated_ads_access_present::text),
    ('03_ads_rls_enabled_and_forced', v.ads_rls_enabled_and_forced::text),
    ('04_owner_scoped_ads_policies_ok', v.owner_scoped_ads_policies_ok::text),
    ('05_legacy_ads_write_policies_absent', v.legacy_ads_write_policies_absent::text),
    ('06_submit_ad_rpc_access_ok', v.submit_ad_rpc_access_ok::text),
    ('07_ownership_helpers_and_trigger_ok', v.ownership_helpers_and_trigger_ok::text),
    ('08_storage_rls_enabled', v.storage_rls_enabled::text),
    ('09_owner_scoped_storage_policies_ok', v.owner_scoped_storage_policies_ok::text),
    ('10_legacy_storage_write_policies_absent', v.legacy_storage_write_policies_absent::text),
    ('11_ads_row_count', v.ads_row_count::text),
    ('12_ads_media_object_count', v.ads_media_object_count::text)
) as checks(item, result)
order by item;
