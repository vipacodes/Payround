-- Run once in Supabase SQL Editor (after supabase_rls_and_auth.sql).
-- Lets the login page tell "email not registered" from "wrong password"
-- without opening the users table to the public.

create or replace function public.account_exists(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.users
      where lower(email) = lower(trim(p_email))
    )
    or exists (
      select 1 from auth.users
      where lower(email) = lower(trim(p_email))
    );
$$;

revoke all on function public.account_exists(text) from public;
grant execute on function public.account_exists(text) to anon, authenticated;
