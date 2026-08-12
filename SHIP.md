# Ship the security fix

I cannot log into your Vercel or GitHub from this sandbox. You deploy in three steps.

## 1. Supabase (do this first)

1. Dashboard → Authentication → Providers → Email: **on**
2. Authentication → URL configuration:
   - Site URL: `https://payround-omega.vercel.app`
   - Redirect: `https://payround-omega.vercel.app/auth/callback`
3. SQL Editor → paste and run **`supabase_rls_and_auth.sql`**
4. Tell the two existing users: old passwords are dead. They tap **Forgot password** and set a new one via email.

Confirm the leak is closed: from a private window (logged out) `GET /rest/v1/users` with only the anon key should now be empty / 401 / RLS deny.

## 2. Push this code

From a machine that has GitHub access:

```bash
cd Payround
git add -A
git commit -m "Security: Supabase Auth, RLS, no plaintext passwords, legal pages"
git push origin main
```

If Vercel is connected to `vipacodes/Payround`, it will deploy automatically.

## 3. Vercel env

Project → Settings → Environment Variables (Production):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` = `https://payround-omega.vercel.app`

Remove any old hardcoded fallbacks. Redeploy.

**Do not** add `SUPABASE_SERVICE_ROLE_KEY` as `NEXT_PUBLIC_*`.

## After deploy

- Sign up a **new** test account — password must work via Auth, not the old `users.password_hash` column.
- Existing users: Forgot password only.
- Homepage stats should show real counts (2 users), not 100000+.
- `/privacy` and `/terms` should load.

## What this does not do

- No Paystack/Flutterwave (as requested).
- Photos are still stored as data URLs (move to Storage later).
- Logged-in users can still see other members’ profiles (needed for groups). Guests cannot dump the DB.
