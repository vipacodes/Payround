-- PayRound Supabase Setup - Run this in Supabase Dashboard -> SQL Editor -> New Query
-- Project: https://biqutnjvhkvldrihywdb.supabase.co

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- USERS TABLE - 1 account per email enforced, trial once per email
create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  name text not null,
  phone text,
  password_hash text,
  trial_used boolean default false,
  role text default 'member',
  created_at timestamp with time zone default now()
);
alter table users enable row level security;
create policy "Public can read users" on users for select using (true);
create policy "Public can insert users" on users for insert with check (true);
create policy "Public can update users" on users for update using (true);

-- GROUPS TABLE - With 12 colors, status, KYC, receipts, freeze logic
create table if not exists groups (
  id text primary key,
  name text not null,
  description text,
  amount integer not null,
  frequency text not null,
  max_members integer not null,
  color text not null default '#0A7E3C',
  admin_email text not null,
  admin_name text,
  status text not null default 'pending_owner', -- pending_owner, trial_active, trial_frozen, active, grace, frozen, deleted, rejected, pending_renewal
  selfie_url text,
  id_url text,
  id_type text,
  creation_receipt_url text,
  renewal_receipt_url text,
  first_payment_at timestamp with time zone,
  trial_ends_at timestamp with time zone,
  frozen_at timestamp with time zone,
  delete_at timestamp with time zone,
  expiry_at timestamp with time zone,
  grace_ends_at timestamp with time zone,
  health integer default 100,
  is_verified boolean default false,
  rejection_reason text,
  created_at timestamp with time zone default now()
);
alter table groups enable row level security;
create policy "Public read groups" on groups for select using (true);
create policy "Public insert groups" on groups for insert with check (true);
create policy "Public update groups" on groups for update using (true);
create policy "Public delete groups" on groups for delete using (true);

-- MEMBER RECEIPTS - Pending until Group Admin approves
create table if not exists member_receipts (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  member_email text not null,
  member_name text not null,
  amount integer not null,
  receipt_url text not null,
  status text not null default 'pending', -- pending, approved, rejected
  uploaded_at timestamp with time zone default now(),
  approved_at timestamp with time zone
);
alter table member_receipts enable row level security;
create policy "Public read receipts" on member_receipts for select using (true);
create policy "Public insert receipts" on member_receipts for insert with check (true);
create policy "Public update receipts" on member_receipts for update using (true);

-- ADS - Pricing 500/day, 3325/week, 13500/month + media + receipt
create table if not exists ads (
  id text primary key,
  business_name text not null,
  description text not null,
  phone text not null,
  website text,
  media_url text not null,
  media_type text default 'image',
  duration_days integer not null,
  price integer not null,
  payment_receipt_url text not null,
  status text not null default 'pending', -- pending, approved, rejected, expired
  submitter_email text not null,
  submitted_at timestamp with time zone default now(),
  approved_at timestamp with time zone,
  expires_at timestamp with time zone
);
alter table ads enable row level security;
create policy "Public read ads" on ads for select using (true);
create policy "Public insert ads" on ads for insert with check (true);
create policy "Public update ads" on ads for update using (true);

-- OWNER SETTINGS - Editable anytime, Palmpay 9151723199
create table if not exists owner_settings (
  id integer primary key default 1,
  bank_name text not null default 'Palmpay',
  account_number text not null default '9151723199',
  account_name text not null default 'Basikoro James Okeroghene',
  whatsapp text not null default '+2349151723199',
  group_fee integer not null default 5000,
  renewal_fee integer not null default 5000,
  ad_1day integer not null default 500,
  ad_1week integer not null default 3325,
  ad_1month integer not null default 13500,
  updated_at timestamp with time zone default now()
);
alter table owner_settings enable row level security;
create policy "Public read owner_settings" on owner_settings for select using (true);
create policy "Public upsert owner_settings" on owner_settings for insert with check (true);
create policy "Public update owner_settings" on owner_settings for update using (true);

-- Insert default owner settings
insert into owner_settings (id, bank_name, account_number, account_name, whatsapp, group_fee, renewal_fee, ad_1day, ad_1week, ad_1month)
values (1, 'Palmpay', '9151723199', 'Basikoro James Okeroghene', '+2349151723199', 5000, 5000, 500, 3325, 13500)
on conflict (id) do update set
  bank_name = excluded.bank_name,
  account_number = excluded.account_number,
  account_name = excluded.account_name,
  whatsapp = excluded.whatsapp,
  group_fee = excluded.group_fee,
  renewal_fee = excluded.renewal_fee,
  ad_1day = excluded.ad_1day,
  ad_1week = excluded.ad_1week,
  ad_1month = excluded.ad_1month,
  updated_at = now();

-- NOTIFICATIONS - For owner dashboard + WhatsApp to +2349151723199
create table if not exists notifications (
  id text primary key,
  type text not null,
  group_id text,
  message text not null,
  is_read boolean default false,
  created_at timestamp with time zone default now()
);
alter table notifications enable row level security;
create policy "Public read notifications" on notifications for select using (true);
create policy "Public insert notifications" on notifications for insert with check (true);
create policy "Public update notifications" on notifications for update using (true);

-- SEED ORIGINAL GROUPS with colors
insert into groups (id, name, description, amount, frequency, max_members, color, admin_email, admin_name, status, is_verified, health)
values 
  ('BF10248', 'Bright Future Ajo', 'A community savings group for bright futures. We save together, grow together.', 50000, 'Weekly', 20, '#0A7E3C', 'bola@example.com', 'Bola Adewale', 'active', true, 92),
  ('MF56789', 'Market Women Ajo', 'For traders at Balogun Market. Daily contributions, weekly payouts.', 2000, 'Daily', 15, '#2563EB', 'esther@example.com', 'Esther Ogunlesi', 'active', true, 85),
  ('CF90123', 'Church Family Fund', 'Church members supporting each other through monthly contributions.', 10000, 'Monthly', 25, '#DC2626', 'john@example.com', 'Pastor John Adebayo', 'active', true, 78)
on conflict (id) do nothing;

-- SEED ADS
insert into ads (id, business_name, description, phone, website, media_url, duration_days, price, payment_receipt_url, status, submitter_email, expires_at)
values
  ('ad1', 'BolarTech Solutions', 'Affordable web development and IT services. We build modern websites from ₦150,000.', '08012345678', 'https://bolartech.com', 'https://via.placeholder.com/400x200?text=BolarTech', 30, 13500, 'https://via.placeholder.com/400x200?text=Receipt', 'approved', 'admin@test.com', now() + interval '30 days'),
  ('ad2', 'Deola Fashion House', 'Premium native and contemporary fashion. Custom designs for all occasions.', '08098765432', null, 'https://via.placeholder.com/400x200?text=Deola', 7, 3325, 'https://via.placeholder.com/400x200?text=Receipt', 'approved', 'admin@test.com', now() + interval '7 days')
on conflict (id) do nothing;
