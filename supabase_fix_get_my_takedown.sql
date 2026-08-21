-- PayRound: fix get_my_takedown crash that silently disabled the account
-- lock screens (owner-deletion warning, voluntary deletion, freeze).
-- 2026-08-21
--
-- get_my_takedown ordered by t.created_at, but account_takedowns has
-- taken_down_at. The function raised 42703 for EVERY caller, and the user
-- app's global watcher exits early when that call errors — so the
-- full-screen deletion warning never rendered. Order by the real column.
--
-- Safe to run more than once.

begin;

create or replace function public.get_my_takedown()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_actor text := public.payround_actor_email();
  v_reason text;
begin
  if auth.uid() is null or v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select t.reason into v_reason
  from public.account_takedowns t
  where lower(btrim(t.email)) = v_actor
  order by t.taken_down_at desc
  limit 1;
  return jsonb_build_object('taken_down', found, 'reason', v_reason);
end;
$function$;

commit;
