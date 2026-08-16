-- PayRound hardening — phone part 5 of 6: Private online presence
-- Run parts 1 through 6 in order. This part is rerunnable.

begin;

-- ---------------------------------------------------------------------------
-- 5. Private user presence and owner-only online list
-- ---------------------------------------------------------------------------
create table if not exists public.user_presence (
  user_id uuid primary key references public.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_presence_last_seen_idx
  on public.user_presence(last_seen_at desc);

alter table public.user_presence enable row level security;
alter table public.user_presence force row level security;
revoke all on table public.user_presence from public, anon, authenticated;
grant select on table public.user_presence to authenticated;

drop policy if exists user_presence_owner_select on public.user_presence;
create policy user_presence_owner_select
on public.user_presence for select to authenticated
using (public.payround_is_owner());

create or replace function public.touch_user_presence()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
begin
  if public.payround_actor_email() is null then
    raise exception 'Authentication required';
  end if;
  select u.id into v_user_id
  from public.users u
  where lower(u.email) = public.payround_actor_email()
  limit 1;
  if v_user_id is null then
    return false;
  end if;
  insert into public.user_presence(user_id, last_seen_at, updated_at)
  values (v_user_id, now(), now())
  on conflict (user_id) do update
    set last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at;
  return true;
end;
$$;

create or replace function public.get_owner_online_users()
returns table (
  user_id uuid,
  email text,
  name text,
  profile_pic text,
  is_verified boolean,
  last_seen_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.payround_is_owner() then
    raise exception 'Owner authorization required';
  end if;
  return query
  select u.id, lower(u.email), u.name, u.profile_pic, coalesce(u.is_verified, false), p.last_seen_at
  from public.user_presence p
  join public.users u on u.id = p.user_id
  where p.last_seen_at >= now() - interval '75 seconds'
  order by p.last_seen_at desc, u.name nulls last;
end;
$$;

revoke all on function public.touch_user_presence() from public, anon;
revoke all on function public.get_owner_online_users() from public, anon;
grant execute on function public.touch_user_presence() to authenticated, service_role;
grant execute on function public.get_owner_online_users() to authenticated, service_role;

-- Enable Realtime invalidation when the standard Supabase publication exists.
do $presence_realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication p
       join pg_publication_rel pr on pr.prpubid = p.oid
       join pg_class c on c.oid = pr.prrelid
       join pg_namespace n on n.oid = c.relnamespace
       where p.pubname = 'supabase_realtime'
         and n.nspname = 'public'
         and c.relname = 'user_presence'
     ) then
    alter publication supabase_realtime add table public.user_presence;
  end if;
end
$presence_realtime$;

commit;
