-- PayRound hardening — phone part 1 of 6: Identity helpers
-- Run parts 1 through 6 in order. This part is rerunnable.

begin;

-- ---------------------------------------------------------------------------
-- 1. JWT-derived identity helpers (never trust an email supplied by a client)
-- ---------------------------------------------------------------------------
create or replace function public.payround_actor_email()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select lower(nullif(coalesce(
    current_setting('request.jwt.claim.email', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  ), ''))
$$;

create or replace function public.payround_is_owner()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(public.payround_actor_email() = any (array[
    'vipadarapper@gmail.com'::text,
    'payroundsupport@gmail.com'::text
  ]), false)
$$;

create or replace function public.payround_is_group_admin(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(exists (
    select 1 from public.groups g
    where g.id = p_group_id
      and lower(g.admin_email) = public.payround_actor_email()
  ), false)
$$;

create or replace function public.payround_is_group_member(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(exists (
    select 1 from public.members m
    where m.group_id = p_group_id
      and lower(m.member_email) = public.payround_actor_email()
      and m.status = 'approved'
  ), false)
$$;

create or replace function public.payround_is_group_participant(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.payround_is_group_admin(p_group_id)
      or public.payround_is_group_member(p_group_id)
$$;

create or replace function public.payround_group_chat_open(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((select g.chat_open from public.groups g where g.id = p_group_id), false)
$$;

create or replace function public.payround_owns_payment(p_payment_id text, p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(exists (
    select 1 from public.payments p
    where p.id = p_payment_id
      and p.group_id = p_group_id
      and lower(p.user_email) = public.payround_actor_email()
  ), false)
$$;

revoke all on function public.payround_actor_email() from public, anon;
revoke all on function public.payround_is_owner() from public, anon;
revoke all on function public.payround_is_group_admin(text) from public, anon;
revoke all on function public.payround_is_group_member(text) from public, anon;
revoke all on function public.payround_is_group_participant(text) from public, anon;
revoke all on function public.payround_group_chat_open(text) from public, anon;
revoke all on function public.payround_owns_payment(text, text) from public, anon;
grant execute on function public.payround_actor_email() to authenticated, service_role;
grant execute on function public.payround_is_owner() to authenticated, service_role;
grant execute on function public.payround_is_group_admin(text) to authenticated, service_role;
grant execute on function public.payround_is_group_member(text) to authenticated, service_role;
grant execute on function public.payround_is_group_participant(text) to authenticated, service_role;
grant execute on function public.payround_group_chat_open(text) to authenticated, service_role;
grant execute on function public.payround_owns_payment(text, text) to authenticated, service_role;

commit;
