-- PayRound referral balance reconciliation
-- Removes the obsolete N200 signup amount and makes displayed earnings equal only
-- to valid group-qualified claims whose status is awarded.

begin;

-- Pay every pending N500 claim for one newly eligible referrer. Updating claim rows
-- first makes concurrent trigger calls idempotent; the protected profile ledger is
-- then recomputed from awarded claims only.
create or replace function public.pay_pending_referral_bonuses(p_referrer_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_count integer := 0;
  v_referred_ids uuid[] := array[]::uuid[];
  v_referred_id uuid;
  v_ref_email text;
  v_referred_name text;
begin
  if p_referrer_id is null
     or not public.referral_referrer_is_eligible(p_referrer_id) then
    return 0;
  end if;

  with paid as (
    update public.referral_claims as c
    set status = 'awarded',
        bonus_amount = 500,
        awarded_at = now()
    where c.referrer_user_id = p_referrer_id
      and c.status = 'pending'
      and c.qualifying_group_id is not null
    returning c.referred_user_id
  )
  select count(*)::integer,
         coalesce(array_agg(referred_user_id), array[]::uuid[])
    into v_count, v_referred_ids
  from paid;

  if v_count = 0 then
    return 0;
  end if;

  -- Recompute from awarded claims instead of incrementing a legacy profile value.
  -- This keeps the displayed ledger at exactly N500 per valid awarded person and
  -- prevents an obsolete signup amount (such as N200) from carrying forward.
  update public.users as u
  set referral_earnings = coalesce((
    select sum(c.bonus_amount)
    from public.referral_claims as c
    where c.referrer_user_id = p_referrer_id
      and c.status = 'awarded'
  ), 0)
  where u.id = p_referrer_id
  returning lower(btrim(u.email)) into v_ref_email;

  foreach v_referred_id in array v_referred_ids loop
    select coalesce(nullif(btrim(name), ''), 'A referred member')
      into v_referred_name
    from public.users
    where id = v_referred_id;

    begin
      insert into public.notifications (id, type, user_email, message, is_read)
      values (
        'ref500-paid-' || v_referred_id::text,
        'referral_bonus',
        v_ref_email,
        '🎁 ' || coalesce(v_referred_name, 'A referred member') ||
          ' created a PayRound-approved group — ₦500 has been added to your referral earnings.',
        false
      )
      on conflict (id) do nothing;
    exception when others then
      null;
    end;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.pay_pending_referral_bonuses(uuid) from public, anon, authenticated;

-- The profile column is a protected ledger/cache, never an independent source of
-- rewards. Reconcile it to awarded claims so old signup bonuses cannot be displayed.
with awarded_totals as (
  select
    u.id,
    coalesce(sum(c.bonus_amount) filter (where c.status = 'awarded'), 0)::integer as total
  from public.users as u
  left join public.referral_claims as c on c.referrer_user_id = u.id
  group by u.id
)
update public.users as u
set referral_earnings = t.total
from awarded_totals as t
where u.id = t.id
  and coalesce(u.referral_earnings, 0) is distinct from t.total;

-- Replace obsolete N200 signup-bonus notices with a relationship-only explanation.
-- This both removes the false reward claim and avoids retaining the referred email in
-- the old notification text.
update public.notifications
set type = 'referral_recorded',
    message = '👋 A member joined with your referral link. No signup bonus was awarded. You can earn ₦500 only after PayRound approves their first group under the current rules.'
where type = 'referral_bonus'
  and (
    message ilike '%earned ₦200%'
    or message ilike '%earned N200%'
  );

commit;
