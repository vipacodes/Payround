-- PayRound: guaranteed personal notifications for account freeze state changes
-- Safe to run more than once.

begin;

create or replace function public.notify_account_freeze_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(new.email, '')));
  v_type text;
  v_message text;
begin
  if new.is_frozen is not distinct from old.is_frozen or v_email = '' then
    return new;
  end if;

  if new.is_frozen then
    v_type := 'account_frozen';
    v_message := '❄️ The PayRound owner froze your account. Your app access is paused. If you believe this is a mistake, contact PayRound support on WhatsApp: +234 915 1723 199.';
  else
    v_type := 'account_unfrozen';
    v_message := '🔥 The PayRound owner unfroze your account. Your account is active again and you can use the app normally.';
  end if;

  insert into public.notifications (
    id,
    type,
    group_id,
    message,
    is_read,
    created_at,
    user_email
  ) values (
    'account-state-' || new.id::text || '-' || v_type || '-' || pg_catalog.txid_current()::text,
    v_type,
    null,
    v_message,
    false,
    pg_catalog.now(),
    v_email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.notify_account_freeze_change() from public, anon, authenticated;
grant execute on function public.notify_account_freeze_change() to service_role;

drop trigger if exists users_notify_account_freeze_change on public.users;
create trigger users_notify_account_freeze_change
after update of is_frozen on public.users
for each row
when (old.is_frozen is distinct from new.is_frozen)
execute function public.notify_account_freeze_change();

-- Give any account that is already frozen its missing personal notice once.
insert into public.notifications (
  id,
  type,
  group_id,
  message,
  is_read,
  created_at,
  user_email
)
select
  'account-frozen-backfill-' || u.id::text,
  'account_frozen',
  null,
  '❄️ The PayRound owner froze your account. Your app access is paused. If you believe this is a mistake, contact PayRound support on WhatsApp: +234 915 1723 199.',
  false,
  pg_catalog.now(),
  pg_catalog.lower(pg_catalog.btrim(u.email))
from public.users u
where u.is_frozen
  and nullif(pg_catalog.btrim(coalesce(u.email, '')), '') is not null
  and not exists (
    select 1
    from public.notifications n
    where n.type = 'account_frozen'
      and pg_catalog.lower(pg_catalog.btrim(coalesce(n.user_email, '')))
        = pg_catalog.lower(pg_catalog.btrim(u.email))
  )
on conflict (id) do nothing;

commit;
