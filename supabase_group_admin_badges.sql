begin;

-- Small public projection used by group cards. It exposes only the approved
-- admin's public identity and blue-badge state; email and contact fields remain private.
create or replace function public.get_public_group_admin_badges()
returns table(
  group_id text,
  admin_user_id uuid,
  admin_name text,
  admin_is_verified boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    g.id,
    u.id,
    coalesce(nullif(btrim(g.admin_name), ''), u.name),
    coalesce(u.is_verified, false)
  from public.groups g
  join public.users u
    on lower(btrim(u.email)) = lower(btrim(g.admin_email))
  where lower(coalesce(g.status, '')) in ('active', 'approved', 'trial_active')
    and not coalesce(g.is_frozen, false)
    and (coalesce(u.is_approved, false) or lower(coalesce(u.approval_status, '')) = 'approved')
    and not coalesce(u.is_frozen, false)
  order by g.created_at desc;
$$;

revoke all on function public.get_public_group_admin_badges() from public;
grant execute on function public.get_public_group_admin_badges() to anon, authenticated;

commit;
