-- PayRound: unapproved groups are invisible to everyone except their creator
-- and the owner. 2026-08-21
--
-- The public_groups view already excludes pending_owner groups, and the
-- groups RLS select policy only allows participants/owner. This closes the
-- two remaining public RPC leaks: member count and spot holders responded
-- for ANY group id, including groups still waiting for owner approval.
--
-- Safe to run more than once.

begin;

create or replace function public.public_group_member_count(p_group_id text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from members
  where group_id = p_group_id and status in ('approved','active')
    and exists (
      select 1 from groups g
      where g.id = p_group_id
        and lower(coalesce(g.status, '')) in ('active', 'approved', 'trial_active')
    );
$$;

create or replace function public.public_group_spots(p_group_id text)
returns table(spot integer, holder_name text)
language sql
stable
security definer
set search_path = public
as $$
  select s.n as spot,
         split_part(trim(m.member_name), ' ', 1) as holder_name
  from members m
  cross join lateral unnest(
    string_to_array(regexp_replace(coalesce(m.spots,''), '[^0-9,]', '', 'g'), ',')
  ) as raw(val)
  cross join lateral (select nullif(trim(raw.val), '')::int as n) s
  where m.group_id = p_group_id
    and m.status in ('approved','active')
    and s.n is not null
    and exists (
      select 1 from groups g
      where g.id = p_group_id
        and lower(coalesce(g.status, '')) in ('active', 'approved', 'trial_active')
    );
$$;

commit;
