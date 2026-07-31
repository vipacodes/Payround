# PayRound v2.0 - Owner Approved System

Live: https://payround-xi.vercel.app
Repo: https://github.com/vipacodes/Payround

Nigeria's Trusted Ajo Platform with full Owner verification system.

## 🚀 NEW FEATURES (All 9 Adjustments Implemented)

### 1. Group Creation ₦5000 + Owner Verification
- Manual transfer to **Palmpay 9151723199 | Basikoro James Okeroghene**
- User uploads receipt + selfie + valid ID (NIN, Voter's Card, Driver's License, Passport)
- Group details remain **pending, not deleted**, until Owner approves
- Owner can change bank details anytime via Owner Dashboard → Settings

### 2. Owner Notifications
- **WhatsApp:** +2349151723199 (wa.me links free, ready for Business API)
- **Dashboard:** In-app bell + pending queues
- Events: new group request, renewal, ad submission

### 3. KYC Mandatory
- Clear selfie + valid ID required to create group
- Stored via **Free Storage Pipeline**: Cloudinary 25GB (free) + 150KB WebP compression + Telegram unlimited backup

### 4. 6-Month Expiration + Renewal Freeze
- Countdown starts **only after first member payment**
- 6 months → **7 days grace** (warning banner) → **Frozen** (no edit, no contributions)
- Frozen groups: **Only Owner can unfreeze** after renewal ₦5000 approval
- Renewal also ₦5000 to same account

### 5. Search Bug Fixed
- Only **owner-approved Active/Grace/Trial groups** are searchable
- Pending groups only visible to Owner + creator

### 6. Free Storage (No Cost)
- **Cloudinary Free = 25GB** + auto-compress to 150KB WebP
- **Telegram Bot** private channel = unlimited backup (optional)
- Auto-cleanup after 30 days
- Code in `lib/storage.ts`

### 7. Ads with Media + Receipt
- Pricing: 1 day ₦500, 1 week ₦3,325 (5% off), 1 month ₦13,500 (10% off)
- Custom duration auto-calculated
- Must upload **ad media + payment receipt** to Palmpay 9151723199
- Owner approves in dashboard → ad goes live → auto-expires
- Files: `app/ads/page.tsx`

### 8. Member Receipts Pending Admin Confirm
- Member pays to Group Admin (not Owner) + uploads receipt
- Status = **Pending** until Group Admin clicks Approve
- Fixed: previously auto-approved, now requires admin approval
- Group Admin dashboard: `app/dashboard/group/[id]/page.tsx`

### 9. Additional
- **1 Account Per Email** enforced (localStorage mock + ready for Supabase unique constraint)
- Trial: **Once per email only**. Flow: 0-7 days Active Trial → 7-14 days Frozen (no edit) → Auto-delete if no ₦5000 payment
- Renewal freeze: 7 days grace → Frozen (no edit, only Owner unfreeze, never auto-delete)
- Group details editable by Group Admin except when frozen
- ₦5000 per group, new group = another ₦5000
- Member receipts hidden from Owner main dashboard but accessible via group drill-down if needed

---

## 📁 Structure

- `app/page.tsx` - Landing with searchable groups, ads carousel, owner settings display
- `app/auth/page.tsx` - Signup/Login, 1 account per email enforcement
- `app/create-group/page.tsx` - Create group with KYC + trial once per email + payment receipt
- `app/dashboard/owner/page.tsx` - Owner Dashboard 👑: approve groups, renewals, ads, change bank details, notifications
- `app/dashboard/group/[id]/page.tsx` - Group Admin dashboard: edit (except frozen), member receipts pending approval, renewal
- `app/ads/page.tsx` - Ad submission with media + receipt
- `lib/db.ts` - Mock DB (localStorage) ready for Supabase migration, lifecycle engine (trial freeze, delete, grace, frozen)
- `lib/storage.ts` - Free storage: Cloudinary 25GB + compression + Telegram backup
- `lib/whatsapp.ts` - WhatsApp wa.me link generator for owner notifications

---

## 🔧 Env Setup

Copy `.env.example` to `.env.local`:

```
OWNER_EMAIL=vipacodes@gmail.com
OWNER_WHATSAPP=+2349151723199
NEXT_PUBLIC_OWNER_BANK_NAME=Palmpay
NEXT_PUBLIC_OWNER_ACCOUNT_NUMBER=9151723199
NEXT_PUBLIC_OWNER_ACCOUNT_NAME=Basikoro James Okeroghene

# Cloudinary Free (25GB)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=...
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=payround_unsigned

# Telegram Backup (unlimited free)
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHANNEL_ID=@your_private_channel

# Supabase (for production 1 account/email + persistence)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

---

## 🚀 Deploy to Vercel

1. Push to GitHub (this repo)
2. Vercel → Import Git Repo → `vipacodes/Payround`
3. Add env vars
4. Deploy - it will be https://payround-xi.vercel.app

For Cloudinary:
- Create free account at cloudinary.com
- Settings → Upload → Create unsigned preset `payround_unsigned` → Save
- Copy cloud name

For Telegram Unlimited Backup:
- Talk to @BotFather → /newbot → get token
- Create private channel → add bot as admin → get channel ID (e.g. @payround_backup)
- Add to env

---

## 👑 Owner vs Group Admin

- **Owner**: Basikoro James - super admin of whole platform, approves groups, renewals, ads, changes bank details anytime
- **Group Administrator**: Creates and runs individual Ajo groups, approves member receipts, edits group (except when frozen)

---

## 📱 WhatsApp Notifications

Free implementation uses wa.me links. For auto-send, integrate WhatsApp Business API (paid) later via env `WHATSAPP_API_TOKEN`.

Owner number: +2349151723199

---

## 🗄️ Storage - Never Pay Early

- Cloudinary free 25GB holds ~100k compressed receipts (150KB each)
- Telegram backup unlimited free
- After 30 days, compress further and archive
- Later, add S3 for ₦500/month if needed

---

## ✅ Trial & Freeze Logic (Code in lib/db.ts)

```ts
Trial:
Days 0-7: trial_active (editable)
Days 7-14: trial_frozen (no edit, banner Pay to unfreeze)
After Day 14: deleted (auto-delete if no payment) + trial_used flag stays true

6-Month:
First member payment → expiry = +6 months
Expiry → grace (7 days warning)
Grace ends → frozen (no edit, no contributions, hidden from search, only Owner unfreeze)
Renewal: Group Admin pays ₦5000 + receipt → pending_renewal → Owner approves → active + 6 months reset

1 Account Per Email: db.createUser checks uniqueness, trialUsed boolean per email
```

---

Built with Next.js 14, Tailwind, localStorage mock ready for Supabase.
