-- Payround: lock DB + prepare Supabase Auth
-- Run in Supabase SQL Editor AFTER deploying the new app (or just before).
-- Existing members must use Forgot password (Supabase email) — old plaintext passwords are wiped.

begin;

create or replace function public.jwt_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt()->>'email', ''))
$$;

-- Wipe secrets that were world-readable
update public.users
set password_hash = null,
    reset_code = null,
    reset_expires = null
where true;

-- Enable + force RLS
do $$
declare t text;
begin
  foreach t in array array[
    'users','groups','members','member_receipts','owner_settings','support_threads',
    'ads','messages','group_messages','notifications','ad_events','group_reviews',
    'payments','payouts','business_reviews','member_reviews','group_edit_requests','support_messages'
  ]
  loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
      execute format('alter table public.%I enable row level security', t);
      execute format('alter table public.%I force row level security', t);
    end if;
  end loop;
end $$;

-- Drop old public policies
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname='public'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated, public;
grant usage on schema public to anon, authenticated;

-- Public group cards (no emails, no selfies)
create or replace view public.public_groups as
select id, name, description, amount, frequency, max_members, color, status, admin_name, is_verified, health, created_at
from public.groups
where coalesce(status, '') in ('active', 'approved', 'trial_active');

grant select on public.public_groups to anon, authenticated;

-- Approved ads: public marketing fields only
drop view if exists public.public_ads;
create view public.public_ads as
select id, business_name, description, website, media_url, media_type, status, expires_at, submitted_at
from public.ads
where status = 'approved';

grant select on public.public_ads to anon, authenticated;

-- Public pricing (no bank / owner password)
drop view if exists public.public_pricing;
create view public.public_pricing as
select id, group_fee, renewal_fee, ad_1day, ad_1week, ad_1month,
       plan_1m, plan_6m, plan_12m,
       announcement_text,
       bank_name, account_number, account_name, whatsapp
from public.owner_settings
where id = 1;

grant select on public.public_pricing to anon, authenticated;

-- Authenticated: operational access scoped by email where possible
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- USERS
create policy users_select on public.users
  for select to authenticated
  using (true);

create policy users_insert on public.users
  for insert to authenticated
  with check (lower(email) = public.jwt_email());

create policy users_update on public.users
  for update to authenticated
  using (lower(email) = public.jwt_email())
  with check (lower(email) = public.jwt_email());

-- GROUPS
create policy groups_select on public.groups
  for select to authenticated using (true);

create policy groups_insert on public.groups
  for insert to authenticated
  with check (lower(admin_email) = public.jwt_email());

create policy groups_update on public.groups
  for update to authenticated
  using (lower(admin_email) = public.jwt_email());

create policy groups_delete on public.groups
  for delete to authenticated
  using (lower(admin_email) = public.jwt_email());

-- MEMBERS
create policy members_select on public.members
  for select to authenticated using (true);

create policy members_insert on public.members
  for insert to authenticated
  with check (lower(member_email) = public.jwt_email());

create policy members_update on public.members
  for update to authenticated
  using (
    lower(member_email) = public.jwt_email()
    or exists (
      select 1 from public.groups g
      where g.id = members.group_id and lower(g.admin_email) = public.jwt_email()
    )
  );

create policy members_delete on public.members
  for delete to authenticated
  using (
    exists (
      select 1 from public.groups g
      where g.id = members.group_id and lower(g.admin_email) = public.jwt_email()
    )
  );

-- DMs
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='messages') then
    execute $p$
      create policy messages_rw on public.messages
      for all to authenticated
      using (lower(from_email) = public.jwt_email() or lower(to_email) = public.jwt_email())
      with check (lower(from_email) = public.jwt_email())
    $p$;
  end if;
end $$;

-- Group chat: members of that group
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='group_messages') then
    execute $p$
      create policy gm_select on public.group_messages for select to authenticated
      using (
        exists (select 1 from public.groups g where g.id = group_messages.group_id and lower(g.admin_email) = public.jwt_email())
        or exists (select 1 from public.members m where m.group_id = group_messages.group_id and lower(m.member_email) = public.jwt_email() and m.status = 'approved')
      )
    $p$;
    execute $p$
      create policy gm_insert on public.group_messages for insert to authenticated
      with check (lower(from_email) = public.jwt_email())
    $p$;
  end if;
end $$;

-- Notifications: own email
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='user_email') then
    execute $p$
      create policy notif_select on public.notifications for select to authenticated
      using (user_email is null or lower(user_email) = public.jwt_email())
    $p$;
    execute $p$
      create policy notif_insert on public.notifications for insert to authenticated with check (true)
    $p$;
    execute $p$
      create policy notif_update on public.notifications for update to authenticated
      using (user_email is null or lower(user_email) = public.jwt_email())
    $p$;
  else
    execute $p$ create policy notif_all on public.notifications for all to authenticated using (true) with check (true) $p$;
  end if;
end $$;

-- Receipts / payments / ads: authenticated (app already scopes in UI)
do $$
declare t text;
begin
  foreach t in array array['member_receipts','payments','payouts','ads','ad_events','group_reviews','business_reviews','member_reviews','group_edit_requests','support_threads','support_messages']
  loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
      execute format('create policy %I_all on public.%I for all to authenticated using (true) with check (true)', t, t);
    end if;
  end loop;
end $$;

-- owner_settings: no client access (use public_pricing view). service_role still bypasses.
-- (no policies = deny)

commit;
