# PayRound v2.0 Setup Guide - Free Storage + Vercel

You asked if I can create - Cloudinary needs your email, so I will walk you through (2 mins). Your site WILL work without it (uses base64 mock) but 25GB free is better.

---

## PART 1: Cloudinary Free 25GB (Required for Receipts Forever)

This gives you 25GB free = ~100,000 compressed receipts (150KB each). No credit card.

### Step 1: Create Account
1. Go to https://cloudinary.com/users/register_free
2. Sign up with your email (vipacodes@gmail.com or any)
3. Verify email
4. Login → You will see Dashboard with **Cloud Name** at top left (e.g. `dabc123xyz`) — COPY THIS

### Step 2: Create Unsigned Upload Preset (so app can upload without secret key)
1. In Cloudinary Dashboard → Top right gear icon **Settings**
2. Click **Upload** tab (in settings)
3. Scroll down to **Upload presets** → Click **Add upload preset**
4. Settings:
   - Preset name: `payround_unsigned`
   - Signing mode: **Unsigned** (VERY IMPORTANT)
   - Folder: `payround`
   - Allowed formats: jpg,png,webp,pdf,mp4
5. Click **Save**
6. Done!

You now have:
- Cloud Name: `your_cloud_name` (from dashboard)
- Preset: `payround_unsigned`

---

## PART 2: Telegram Unlimited Backup (Optional but Recommended - Unlimited Free)

This backs up every receipt to a private Telegram channel (unlimited storage free forever).

### Step 1: Create Bot
1. Open Telegram → Search `@BotFather`
2. Send `/newbot`
3. Name: `PayRound Backup`
4. Username: `payround_vipacodes_bot` (must be unique)
5. BotFather will give you **Bot Token** like `123456:ABC...` — COPY

### Step 2: Create Private Channel
1. Telegram → New Channel → Name: `PayRound Backup` → Private
2. Add your bot as Admin: Channel Settings → Administrators → Add Admin → Search your bot username → Make it Admin with Post Messages permission
3. Get Channel ID: Forward a message from channel to @userinfobot or use @getidsbot → It gives ID like `-1001234567890` or `@payround_backup`

---

## PART 3: Connect GitHub to Vercel (Update payround-xi.vercel.app)

### Step 1: Go to Vercel
1. https://vercel.com/dashboard → Find project **payround-xi**
2. Click project → **Settings** → **Git**
3. If it says Connected to GitHub, click **Disconnect** then **Connect Git Repository**
4. Select **vipacodes/Payround** → Branch: **main** → Connect

If no project exists:
1. Vercel Dashboard → **Add New** → **Project** → Import Git Repository → Select **vipacodes/Payround** → Deploy

### Step 2: Add Environment Variables
In Vercel project → **Settings** → **Environment Variables** → Add:

```
OWNER_EMAIL = vipacodes@gmail.com
OWNER_WHATSAPP = +2349151723199
NEXT_PUBLIC_OWNER_EMAIL = vipacodes@gmail.com
NEXT_PUBLIC_OWNER_WHATSAPP = +2349151723199
NEXT_PUBLIC_OWNER_BANK_NAME = Palmpay
NEXT_PUBLIC_OWNER_ACCOUNT_NUMBER = 9151723199
NEXT_PUBLIC_OWNER_ACCOUNT_NAME = Basikoro James Okeroghene
NEXT_PUBLIC_GROUP_CREATION_FEE = 5000
NEXT_PUBLIC_RENEWAL_FEE = 5000
NEXT_PUBLIC_AD_1DAY = 500
NEXT_PUBLIC_AD_1WEEK = 3325
NEXT_PUBLIC_AD_1MONTH = 13500
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = your_cloud_name_here (from Part 1)
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = payround_unsigned
TELEGRAM_BOT_TOKEN = your_bot_token (optional)
TELEGRAM_CHANNEL_ID = your_channel_id (optional)
```

Click **Save** → **Redeploy** (Deployments tab → 3 dots → Redeploy)

---

## PART 4: Test Owner Dashboard

1. Go to https://payround-xi.vercel.app
2. Sign Up with `owner@payround.com` (this email gets Owner Dashboard access for demo)
   - Or set OWNER_EMAIL to your real email and sign up with that
3. In Navbar you will see **Owner Dashboard 👑** (yellow button)
4. Click it → You will see:
   - Pending Groups (selfie + ID + ₦5000 receipt) → Approve/Reject
   - Frozen/Renewals → Unfreeze after ₦5000 renewal
   - Ads Review → Media + receipt → Approve
   - Settings → Change Palmpay details anytime
   - Notifications → WhatsApp + in-app

---

## Without Cloudinary (Works but Limited)

If you skip Part 1, site still works! My code in `lib/storage.ts` has fallback:

```ts
if (!cloudName || !preset) {
  // Stores as base64 in localStorage mock (150KB compressed)
  // Works for demo, but localStorage limited to ~5MB
}
```

So you can deploy to Vercel NOW without any env vars, test everything, then add Cloudinary later for 25GB free.

---

## Quick Checklist

- [ ] Cloudinary account + cloud name + preset `payround_unsigned`
- [ ] (Optional) Telegram bot + channel for unlimited backup
- [ ] Vercel connected to GitHub vipacodes/Payround main
- [ ] Env vars added in Vercel
- [ ] Redeploy
- [ ] Test Owner Dashboard with owner@payround.com

---

## Need Help?

If you get stuck on any step, screenshot the page and send here, I will guide.

After Vercel redeploy, your new URL will still be https://payround-xi.vercel.app but now v2.0 with all fixes.

Owner: Basikoro James Okeroghene | Palmpay 9151723199 | WhatsApp +2349151723199 | 1 account per email | Trial once per email
