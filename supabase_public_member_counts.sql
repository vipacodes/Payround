-- Real member counts for visitors (anon cannot SELECT members).
CREATE OR REPLACE VIEW public.public_groups AS
SELECT g.id,
    g.name,
    g.description,
    g.amount,
    g.frequency,
    g.max_members,
    g.color,
    g.status,
    g.admin_name,
    g.is_verified,
    g.health,
    g.created_at,
    (SELECT count(*)::int FROM public.members m
      WHERE m.group_id = g.id AND m.status IN ('approved','active')) AS member_count
FROM public.groups g
WHERE COALESCE(g.status, ''::text) = ANY (ARRAY['active'::text, 'approved'::text, 'trial_active'::text]);

GRANT SELECT ON public.public_groups TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_group_member_count(p_group_id text)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM members
  WHERE group_id = p_group_id AND status IN ('approved','active');
$$;

REVOKE ALL ON FUNCTION public.public_group_member_count(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_group_member_count(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_group_spots(p_group_id text)
RETURNS TABLE(spot int, holder_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.n AS spot,
         split_part(trim(m.member_name), ' ', 1) AS holder_name
  FROM members m
  CROSS JOIN LATERAL unnest(
    string_to_array(regexp_replace(coalesce(m.spots,''), '[^0-9,]', '', 'g'), ',')
  ) AS raw(val)
  CROSS JOIN LATERAL (SELECT nullif(trim(raw.val), '')::int AS n) s
  WHERE m.group_id = p_group_id
    AND m.status IN ('approved','active')
    AND s.n IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.public_group_spots(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_group_spots(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
