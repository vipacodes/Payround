-- Read-only verification after all six referral migration parts.
-- Results are vertical so they fit on a phone screen.
with verification as (
  select
    (
      to_regprocedure('public.apply_referral(text,text)') is not null
      and to_regprocedure('public.get_my_referral_dashboard()') is not null
      and to_regprocedure('public.set_profile_privacy(boolean,boolean)') is not null
      and to_regprocedure('public.set_referral_list_privacy(boolean)') is not null
      and to_regprocedure('public.set_dob_privacy(boolean)') is not null
      and to_regprocedure('public.get_public_profile_extras(uuid)') is not null
      and to_regprocedure('public.pay_pending_referral_bonuses(uuid)') is not null
    ) as required_functions_ok,
    (
      select count(*) = 5
      from pg_trigger
      where not tgisinternal
        and tgenabled <> 'D'
        and tgname in (
          'guard_referral_accounting',
          'guard_group_referral_approval',
          'guard_member_referral_approval',
          'on_referral_group_approved',
          'on_referral_member_approved'
        )
    ) as required_triggers_ok,
    (
      has_function_privilege('authenticated', 'public.apply_referral(text,text)', 'execute')
      and not has_function_privilege('anon', 'public.apply_referral(text,text)', 'execute')
    ) as referral_rpc_access_ok,
    (
      has_function_privilege('authenticated', 'public.set_referral_list_privacy(boolean)', 'execute')
      and not has_function_privilege('anon', 'public.set_referral_list_privacy(boolean)', 'execute')
      and has_function_privilege('authenticated', 'public.set_dob_privacy(boolean)', 'execute')
      and not has_function_privilege('anon', 'public.set_dob_privacy(boolean)', 'execute')
    ) as privacy_rpc_access_ok,
    (
      not has_table_privilege('authenticated', 'public.referral_claims', 'select')
      and not has_table_privilege('anon', 'public.referral_claims', 'select')
      and not has_table_privilege('authenticated', 'public.referral_bonus_migration_state', 'select')
      and not has_table_privilege('authenticated', 'public.referral_bonus_excluded_groups', 'select')
    ) as internal_tables_private,
    (
      not has_column_privilege('authenticated', 'public.users', 'dob', 'select')
      and not has_column_privilege('authenticated', 'public.users', 'referred_by', 'select')
      and not has_column_privilege('authenticated', 'public.users', 'referral_earnings', 'select')
      and not has_column_privilege('authenticated', 'public.users', 'referrals_public', 'select')
      and not has_column_privilege('authenticated', 'public.users', 'dob_public', 'select')
      and has_column_privilege('authenticated', 'public.users', 'id', 'select')
    ) as sensitive_columns_private,
    (
      not exists (
        select 1
        from public.groups as g
        where lower(coalesce(g.status, '')) in ('active', 'approved')
          and not exists (
            select 1
            from public.referral_bonus_excluded_groups as x
            where x.group_id = g.id
          )
      )
    ) as existing_approved_groups_excluded,
    (select count(*) from public.referral_bonus_migration_state) as migration_state_rows,
    (select count(*) from public.referral_bonus_excluded_groups) as excluded_group_count,
    (select count(*) from public.referral_claims) as recorded_relationship_count,
    (select count(*) from public.referral_claims where status in ('pending', 'awarded')) as new_bonus_count,
    (
      select count(*)
      from public.referral_claims
      where (status = 'referred' and bonus_amount <> 0)
         or (status in ('pending', 'awarded') and bonus_amount <> 500)
         or status not in ('referred', 'pending', 'awarded', 'legacy')
    ) as invalid_claim_count
)
select item as verification_item, result
from verification as v
cross join lateral (
  values
    ('01_required_functions_ok', v.required_functions_ok::text),
    ('02_required_triggers_ok', v.required_triggers_ok::text),
    ('03_referral_rpc_access_ok', v.referral_rpc_access_ok::text),
    ('04_privacy_rpc_access_ok', v.privacy_rpc_access_ok::text),
    ('05_internal_tables_private', v.internal_tables_private::text),
    ('06_sensitive_columns_private', v.sensitive_columns_private::text),
    ('07_existing_approved_groups_excluded', v.existing_approved_groups_excluded::text),
    ('08_migration_state_rows', v.migration_state_rows::text),
    ('09_excluded_group_count', v.excluded_group_count::text),
    ('10_recorded_relationship_count', v.recorded_relationship_count::text),
    ('11_new_bonus_count', v.new_bonus_count::text),
    ('12_invalid_claim_count', v.invalid_claim_count::text)
) as checks(item, result)
order by item;
