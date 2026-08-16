-- PayRound message-request migration — PART 4 OF 5
-- Run after Part 3. Safe to rerun.

begin;

create or replace function public.owner_open_user_support_chat(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user public.users%rowtype;
  v_thread public.support_threads%rowtype;
  v_email text;
begin
  if auth.uid() is null or not public.payround_is_owner() then
    raise exception 'PayRound owner access required' using errcode = '42501';
  end if;

  select * into v_user from public.users u where u.id = p_user_id;
  if not found then raise exception 'User profile not found' using errcode = 'P0002'; end if;
  v_email := pg_catalog.lower(pg_catalog.btrim(v_user.email));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email, 0));

  select * into v_thread
  from public.support_threads t
  where pg_catalog.lower(pg_catalog.btrim(t.user_email)) = v_email
  order by t.last_at desc nulls last
  limit 1
  for update;

  if not found then
    insert into public.support_threads(
      id, user_email, user_name, last_message, last_at, user_read, owner_read
    ) values (
      'st-' || gen_random_uuid()::text,
      v_email,
      coalesce(nullif(pg_catalog.btrim(v_user.name), ''), v_email),
      '',
      pg_catalog.now(),
      true,
      true
    ) returning * into v_thread;
  else
    update public.support_threads t
    set user_name = coalesce(nullif(pg_catalog.btrim(v_user.name), ''), v_email),
        owner_read = true
    where t.id = v_thread.id
    returning * into v_thread;
  end if;

  return to_jsonb(v_thread);
end;
$$;

revoke all on function public.owner_open_user_support_chat(uuid) from public, anon;
grant execute on function public.owner_open_user_support_chat(uuid) to authenticated;

commit;
