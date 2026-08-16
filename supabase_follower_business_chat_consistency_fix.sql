begin;

-- ---------------------------------------------------------------------------
-- 1. Followers: one non-frozen profile = one follower, even while that account
--    is awaiting owner approval. A follow is a deliberate public relationship,
--    so the limited follower card (name/photo/badge only) matches the count.
-- ---------------------------------------------------------------------------

create or replace function public.get_public_follow_summary(p_target_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target_email text;
  v_actor text := public.payround_actor_email();
  v_actor_id uuid;
  v_actor_profile_email text;
  v_count integer;
  v_following boolean := false;
begin
  select lower(btrim(u.email)) into v_target_email
  from public.users u
  where u.id = p_target_id
    and (coalesce(u.is_approved, false) or lower(coalesce(u.approval_status, '')) = 'approved')
    and not coalesce(u.is_frozen, false);
  if v_target_email is null then return null; end if;

  select count(distinct follower.id)::integer into v_count
  from public.follows f
  join public.users follower
    on lower(btrim(follower.email)) = lower(btrim(f.follower_email))
  where (f.following_id = p_target_id::text
         or lower(btrim(f.following_email)) = v_target_email)
    and follower.id <> p_target_id
    and not coalesce(follower.is_frozen, false);

  if auth.uid() is not null and v_actor is not null then
    v_actor_id := public.resolve_authenticated_profile_id();
    select lower(btrim(u.email)) into v_actor_profile_email
    from public.users u where u.id = v_actor_id;

    select exists (
      select 1 from public.follows f
      where lower(btrim(f.follower_email)) in (v_actor, coalesce(v_actor_profile_email, v_actor))
        and (f.following_id = p_target_id::text
             or lower(btrim(f.following_email)) = v_target_email)
    ) into v_following;
  end if;

  return jsonb_build_object('count', coalesce(v_count, 0), 'is_following', v_following);
end;
$$;
revoke all on function public.get_public_follow_summary(uuid) from public;
grant execute on function public.get_public_follow_summary(uuid) to anon, authenticated;

drop function if exists public.get_public_followers(uuid);
create function public.get_public_followers(p_target_id uuid)
returns table(
  id uuid,
  name text,
  profile_pic text,
  is_verified boolean,
  followed_at timestamptz,
  profile_available boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select u.id, u.name, u.profile_pic, coalesce(u.is_verified, false), max(f.created_at),
    (coalesce(u.is_approved, false) or lower(coalesce(u.approval_status, '')) = 'approved')
  from public.users target
  join public.follows f
    on f.following_id = target.id::text
    or lower(btrim(f.following_email)) = lower(btrim(target.email))
  join public.users u
    on lower(btrim(u.email)) = lower(btrim(f.follower_email))
  where target.id = p_target_id
    and (coalesce(target.is_approved, false) or lower(coalesce(target.approval_status, '')) = 'approved')
    and not coalesce(target.is_frozen, false)
    and u.id <> target.id
    and not coalesce(u.is_frozen, false)
  group by u.id, u.name, u.profile_pic, u.is_verified, u.is_approved, u.approval_status
  order by max(f.created_at) desc;
$$;
revoke all on function public.get_public_followers(uuid) from public;
grant execute on function public.get_public_followers(uuid) to anon, authenticated;

create or replace function public.follow_public_user(p_target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.payround_actor_email();
  v_actor_id uuid := public.resolve_authenticated_profile_id();
  v_actor_profile_email text;
  v_actor_name text;
  v_target_email text;
  v_count integer;
begin
  if auth.uid() is null or v_actor is null or v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_target_id = v_actor_id then
    raise exception 'You cannot follow yourself' using errcode = '22023';
  end if;

  select lower(btrim(u.email)), nullif(btrim(u.name), '')
    into v_actor_profile_email, v_actor_name
  from public.users u
  where u.id = v_actor_id and not coalesce(u.is_frozen, false);
  if v_actor_profile_email is null then
    raise exception 'Your profile is unavailable' using errcode = '42501';
  end if;

  select lower(btrim(u.email)) into v_target_email
  from public.users u
  where u.id = p_target_id
    and (coalesce(u.is_approved, false) or lower(coalesce(u.approval_status, '')) = 'approved')
    and not coalesce(u.is_frozen, false);
  if v_target_email is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('payround-follow:' || v_actor_profile_email || ':' || p_target_id::text, 0));
  if not exists (
    select 1 from public.follows f
    where lower(btrim(f.follower_email)) in (v_actor, v_actor_profile_email)
      and (f.following_id = p_target_id::text
           or lower(btrim(f.following_email)) = v_target_email)
  ) then
    insert into public.follows(id, follower_email, following_id, following_email, created_at)
    values (gen_random_uuid()::text, v_actor_profile_email, p_target_id::text, v_target_email, now());

    insert into public.notifications(id, type, user_email, message, is_read, created_at)
    values (
      'foll-' || replace(gen_random_uuid()::text, '-', ''),
      'new_follower',
      v_target_email,
      '➕ ' || coalesce(v_actor_name, 'Someone') || ' started following you on PayRound — tap to see them in your followers list.[[FOL:' || v_actor_id::text || ']]',
      false,
      now()
    );
  end if;

  select count(distinct follower.id)::integer into v_count
  from public.follows f
  join public.users follower
    on lower(btrim(follower.email)) = lower(btrim(f.follower_email))
  where (f.following_id = p_target_id::text
         or lower(btrim(f.following_email)) = v_target_email)
    and follower.id <> p_target_id
    and not coalesce(follower.is_frozen, false);

  return jsonb_build_object('count', coalesce(v_count, 0), 'is_following', true);
end;
$$;
revoke all on function public.follow_public_user(uuid) from public, anon;
grant execute on function public.follow_public_user(uuid) to authenticated;

create or replace function public.unfollow_public_user(p_target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.payround_actor_email();
  v_actor_id uuid := public.resolve_authenticated_profile_id();
  v_actor_profile_email text;
  v_target_email text;
  v_count integer;
begin
  if auth.uid() is null or v_actor is null or v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_target_id = v_actor_id then
    raise exception 'You cannot unfollow yourself' using errcode = '22023';
  end if;

  select lower(btrim(u.email)) into v_actor_profile_email
  from public.users u where u.id = v_actor_id;

  select lower(btrim(u.email)) into v_target_email
  from public.users u
  where u.id = p_target_id
    and (coalesce(u.is_approved, false) or lower(coalesce(u.approval_status, '')) = 'approved')
    and not coalesce(u.is_frozen, false);
  if v_target_email is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  delete from public.follows f
  where lower(btrim(f.follower_email)) in (v_actor, coalesce(v_actor_profile_email, v_actor))
    and (f.following_id = p_target_id::text
         or lower(btrim(f.following_email)) = v_target_email);

  select count(distinct follower.id)::integer into v_count
  from public.follows f
  join public.users follower
    on lower(btrim(follower.email)) = lower(btrim(f.follower_email))
  where (f.following_id = p_target_id::text
         or lower(btrim(f.following_email)) = v_target_email)
    and follower.id <> p_target_id
    and not coalesce(follower.is_frozen, false);

  return jsonb_build_object('count', coalesce(v_count, 0), 'is_following', false);
end;
$$;
revoke all on function public.unfollow_public_user(uuid) from public, anon;
grant execute on function public.unfollow_public_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Businesses: an approved business is public only while its underlying ad
--    is approved and unexpired, and its owner profile is active.
-- ---------------------------------------------------------------------------

create or replace function public.get_public_businesses(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'business_name', a.business_name,
    'description', a.description,
    'website', a.website,
    'media_url', a.media_url,
    'media_type', a.media_type,
    'status', a.status,
    'expires_at', a.expires_at,
    'submitted_at', a.submitted_at,
    'phone', a.phone,
    'contact', a.contact,
    'media_urls', a.media_urls,
    'whatsapp', a.whatsapp,
    'media_alts', a.media_alts,
    'biz_status', a.biz_status
  ) order by a.submitted_at desc), '[]'::jsonb)
  into v_result
  from public.users u
  join public.ads a on lower(btrim(a.submitter_email)) = lower(btrim(u.email))
  where u.id = p_user_id
    and (coalesce(u.is_approved, false) or lower(coalesce(u.approval_status, '')) = 'approved')
    and not coalesce(u.is_frozen, false)
    and lower(coalesce(a.biz_status, '')) = 'approved'
    and lower(coalesce(a.status, '')) = 'approved'
    and (a.expires_at is null or a.expires_at > now());
  return v_result;
end;
$$;
revoke all on function public.get_public_businesses(uuid) from public;
grant execute on function public.get_public_businesses(uuid) to anon, authenticated;

-- Public ad media remains independent from business approval, but removed,
-- declined, archived and expired rows are no longer a public-data back door.
create or replace view public.public_ads as
select
  a.id,
  a.business_name,
  a.description,
  a.website,
  a.media_url,
  a.media_type,
  a.status,
  a.expires_at,
  a.submitted_at,
  a.phone,
  a.duration_days,
  a.approved_at,
  a.contact,
  a.media_urls,
  a.whatsapp,
  a.media_alts,
  a.biz_status
from public.ads a
where lower(coalesce(a.status, '')) = 'approved'
  and (a.expires_at is null or a.expires_at > now());
alter view public.public_ads set (security_barrier = true);
revoke all on public.public_ads from public, anon, authenticated;
grant select on public.public_ads to anon, authenticated;

-- Safe business-detail projection. It never returns submitter email, receipts,
-- prices, banking data, or other private ad-owner fields.
create or replace function public.get_business_page(p_ad_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.payround_actor_email();
  v_ad public.ads%rowtype;
  v_owner public.users%rowtype;
  v_public boolean := false;
  v_submitter boolean := false;
  v_staff boolean := false;
  v_can_manage boolean := false;
begin
  select * into v_ad from public.ads a where a.id = p_ad_id;
  if not found then return null; end if;

  select * into v_owner
  from public.users u
  where lower(btrim(u.email)) = lower(btrim(v_ad.submitter_email))
  limit 1;

  v_public := lower(coalesce(v_ad.biz_status, '')) = 'approved'
    and lower(coalesce(v_ad.status, '')) = 'approved'
    and (v_ad.expires_at is null or v_ad.expires_at > now())
    and v_owner.id is not null
    and (coalesce(v_owner.is_approved, false) or lower(coalesce(v_owner.approval_status, '')) = 'approved')
    and not coalesce(v_owner.is_frozen, false);
  v_submitter := auth.uid() is not null
    and v_actor is not null
    and v_actor = lower(btrim(v_ad.submitter_email));
  v_staff := auth.uid() is not null and public.payround_is_owner();
  v_can_manage := v_submitter or (v_staff and v_ad.id like 'ad-house-%');

  if not v_public and not v_submitter and not v_staff then
    return null;
  end if;

  return jsonb_build_object(
    'ad', jsonb_build_object(
      'id', v_ad.id,
      'business_name', v_ad.business_name,
      'description', v_ad.description,
      'website', v_ad.website,
      'media_url', v_ad.media_url,
      'media_type', v_ad.media_type,
      'status', v_ad.status,
      'expires_at', v_ad.expires_at,
      'submitted_at', v_ad.submitted_at,
      'phone', v_ad.phone,
      'duration_days', v_ad.duration_days,
      'approved_at', v_ad.approved_at,
      'contact', v_ad.contact,
      'media_urls', v_ad.media_urls,
      'whatsapp', v_ad.whatsapp,
      'media_alts', v_ad.media_alts,
      'biz_status', v_ad.biz_status
    ),
    'owner', case when v_owner.id is null then null else jsonb_build_object(
      'id', v_owner.id,
      'name', v_owner.name,
      'profile_pic', v_owner.profile_pic,
      'is_verified', coalesce(v_owner.is_verified, false)
    ) end,
    'is_public', v_public,
    'is_submitter', v_submitter,
    'is_staff_preview', v_staff,
    'can_manage', v_can_manage
  );
end;
$$;
revoke all on function public.get_business_page(text) from public;
grant execute on function public.get_business_page(text) to anon, authenticated;

-- Keep future owner-triggered expiry cleanup consistent with public business state.
create or replace function public.archive_expired_ads()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_count integer;
begin
  if auth.uid() is null or not public.payround_is_owner() then
    raise exception 'PayRound owner access required' using errcode = '42501';
  end if;
  update public.ads
  set status = 'archived', biz_status = 'hidden'
  where status = 'approved' and expires_at < now() - interval '24 hours';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.archive_expired_ads() from public, anon;
grant execute on function public.archive_expired_ads() to authenticated;

-- Search uses the same active-business predicate as profile cards and detail pages.
create or replace function public.search_site(p_q text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  q text;
  safe_q text;
  needle text;
  idq text;
  g jsonb;
  u jsonb;
  b jsonb;
begin
  q := btrim(coalesce(p_q, ''));
  if length(q) < 2 then
    return jsonb_build_object('groups', '[]'::jsonb, 'users', '[]'::jsonb, 'biz', '[]'::jsonb);
  end if;

  safe_q := replace(replace(replace(q, '%', ''), '_', ''), E'\\', '');
  if length(safe_q) < 1 then
    return jsonb_build_object('groups', '[]'::jsonb, 'users', '[]'::jsonb, 'biz', '[]'::jsonb);
  end if;
  needle := '%' || safe_q || '%';
  idq := lower(replace(safe_q, '-', ''));

  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into g
  from (
    select gr.id, gr.name, gr.amount, gr.frequency, gr.avatar_url, gr.is_verified, gr.badge_tier
    from public.groups gr
    where coalesce(gr.status, '') = any (array['active','approved','trial_active'])
      and coalesce(gr.is_frozen, false) = false
      and (
        gr.name ilike needle
        or lower(gr.id::text) = lower(safe_q)
        or (length(safe_q) >= 6 and lower(gr.id::text) like lower(safe_q) || '%')
      )
    order by gr.is_verified desc nulls last, gr.created_at desc
    limit 8
  ) x;

  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into u
  from (
    select usr.id, usr.name, usr.profile_pic, coalesce(usr.is_verified, false) as is_verified
    from public.users usr
    where (coalesce(usr.is_approved, false) or lower(coalesce(usr.approval_status, '')) = 'approved')
      and not coalesce(usr.is_frozen, false)
      and (
        usr.name ilike needle
        or (length(idq) >= 6 and left(replace(usr.id::text, '-', ''), 8) = left(idq, 8))
        or (length(safe_q) >= 6 and lower(usr.id::text) like lower(safe_q) || '%')
      )
    order by usr.is_verified desc nulls last, usr.created_at desc
    limit 8
  ) x;

  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into b
  from (
    select a.id, a.business_name
    from public.ads a
    join public.users owner
      on lower(btrim(owner.email)) = lower(btrim(a.submitter_email))
    where lower(coalesce(a.biz_status, '')) = 'approved'
      and lower(coalesce(a.status, '')) = 'approved'
      and (a.expires_at is null or a.expires_at > now())
      and (coalesce(owner.is_approved, false) or lower(coalesce(owner.approval_status, '')) = 'approved')
      and not coalesce(owner.is_frozen, false)
      and a.business_name ilike needle
    limit 8
  ) x;

  return jsonb_build_object('groups', g, 'users', u, 'biz', b);
end;
$$;
revoke all on function public.search_site(text) from public;
grant execute on function public.search_site(text) to anon, authenticated;

-- Repair already-stale business flags without deleting ad history or analytics.
update public.ads
set biz_status = 'hidden'
where lower(coalesce(biz_status, '')) = 'approved'
  and (
    lower(coalesce(status, '')) <> 'approved'
    or (expires_at is not null and expires_at <= now())
  );

commit;
