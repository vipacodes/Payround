-- PayRound: every group starts with the bronze badge
-- 2026-08-21
--
-- badge_tier had no default, and the guard_group_security_fields trigger
-- explicitly nulled it on user inserts, so newly approved groups showed no
-- tier. Bronze is the starting tier: column default, trigger, and a
-- backfill for existing groups. Silver/gold stay owner-granted upgrades.
--
-- Safe to run more than once.

begin;

alter table public.groups alter column badge_tier set default 'bronze';

update public.groups set badge_tier = 'bronze' where badge_tier is null;

create or replace function public.guard_group_security_fields()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare v_actor text := public.payround_actor_email();
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if auth.uid() is null or v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if public.payround_is_owner() then return new; end if;

  if tg_op = 'INSERT' then
    new.admin_email := v_actor;
    select coalesce(nullif(btrim(u.name), ''), new.admin_name, v_actor)
      into new.admin_name from public.users u where u.id = auth.uid();
    new.is_verified := false;
    new.badge_tier := 'bronze';  -- 🥉 every group starts at bronze
    new.is_frozen := false;
    new.health := coalesce(new.health, 100);
    return new;
  end if;

  if lower(btrim(old.admin_email)) <> v_actor then
    raise exception 'Only the group administrator can change this group' using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['chat_open','announcement','admin_auto_paid','rules']::text[])
     is distinct from
     (to_jsonb(old) - array['chat_open','announcement','admin_auto_paid','rules']::text[]) then
    raise exception 'Submit operational group changes for PayRound review' using errcode = '42501';
  end if;
  return new;
end;
$function$;

commit;
