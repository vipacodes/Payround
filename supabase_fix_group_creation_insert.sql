-- PayRound: restore group creation for signed-in users
-- 2026-08-21
--
-- The groups table had RLS policies for select/update/owner but NO insert
-- policy and NO insert grant for authenticated users, so every group
-- creation failed with "permission denied for table groups" — and no
-- approval request ever reached the owner dashboard.
--
-- This grants INSERT tightly: an authenticated user may only create a group
-- whose admin_email is their own verified email, and only in the two
-- statuses the create flow uses. SELECT is granted so the existing
-- participant/owner read policies actually apply.
--
-- Safe to run more than once.

begin;

grant select, insert on table public.groups to authenticated;

drop policy if exists groups_creator_insert on public.groups;
create policy groups_creator_insert
  on public.groups
  for insert
  to authenticated
  with check (
    lower(btrim(admin_email)) = public.payround_actor_email()
    and status in ('trial_active', 'pending_owner')
  );

commit;
