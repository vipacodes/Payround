\set ON_ERROR_STOP on

do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end $$;
grant usage, create on schema public to current_user;
grant usage on schema public to anon, authenticated, service_role;
create extension if not exists pgcrypto with schema public;

-- Supabase-compatible JWT shim for exercising the baseline RLS script locally.
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object('email', nullif(current_setting('request.jwt.claim.email', true), ''))
$$;

create table public.users (
  id uuid primary key,
  email text not null unique,
  name text,
  phone text,
  profile_pic text,
  is_verified boolean default false,
  password_hash text,
  reset_code text,
  reset_expires timestamptz,
  dob date,
  referred_by uuid,
  referral_earnings integer default 0,
  referrals_public boolean default false,
  dob_public boolean default false,
  created_at timestamptz default now()
);
create table public.groups (
  id text primary key,
  name text,
  description text,
  amount integer,
  frequency text,
  max_members integer,
  color text,
  status text default 'active',
  admin_email text not null,
  admin_name text,
  is_verified boolean default false,
  health integer default 100,
  chat_open boolean default false,
  created_at timestamptz default now()
);
create table public.members (
  id text primary key,
  group_id text not null,
  member_email text not null,
  status text not null
);
create table public.payments (
  id text primary key,
  group_id text not null,
  member_id text,
  user_email text not null,
  member_name text,
  spots text,
  weeks integer not null default 1,
  amount numeric,
  receipt_url text,
  status text not null default 'pending',
  decline_reason text,
  created_at timestamptz default now(),
  reviewed_at timestamptz,
  review_note text
);
create table public.messages (
  id text primary key,
  from_email text not null,
  to_email text not null,
  body text not null,
  read boolean default false,
  created_at timestamptz default now()
);
create table public.group_messages (
  id text primary key,
  group_id text not null,
  from_email text not null,
  body text not null,
  created_at timestamptz default now(),
  image_url text,
  payment_id text,
  receipt_status text
);
create table public.notifications (
  id text primary key,
  type text,
  group_id text,
  message text,
  is_read boolean default false,
  created_at timestamptz default now(),
  user_email text
);
create table public.ads (
  id text primary key,
  business_name text,
  description text,
  website text,
  media_url text,
  media_type text,
  status text not null,
  submitter_email text not null,
  submitted_at timestamptz default now(),
  approved_at timestamptz,
  expires_at timestamptz
);
create table public.owner_settings (
  id integer primary key,
  group_fee integer,
  renewal_fee integer,
  ad_1day integer,
  ad_1week integer,
  ad_1month integer,
  plan_1m integer,
  plan_6m integer,
  plan_12m integer,
  announcement_text text,
  bank_name text,
  account_number text,
  account_name text,
  whatsapp text
);
create table public.ad_events (
  id bigserial primary key,
  ad_id text not null,
  kind text not null,
  media_index integer,
  viewer text,
  created_at timestamptz default now()
);

insert into public.users(id,email,name,is_verified) values
 ('00000000-0000-0000-0000-000000000001','member1@example.com','Member One',true),
 ('00000000-0000-0000-0000-000000000002','member2@example.com','Member Two',false),
 ('00000000-0000-0000-0000-000000000003','admin@example.com','Group Admin',true),
 ('00000000-0000-0000-0000-000000000004','vipadarapper@gmail.com','Owner',true),
 ('00000000-0000-0000-0000-000000000005','advertiser@example.com','Advertiser',false),
 ('00000000-0000-0000-0000-000000000006','outsider@example.com','Outsider',false);
insert into public.groups(id,name,admin_email,chat_open) values
 ('g1','Test Group','admin@example.com',true),
 ('g2','Other Group','member2@example.com',true);
insert into public.members(id,group_id,member_email,status) values
 ('m1','g1','member1@example.com','approved'),
 ('m2','g1','member2@example.com','approved'),
 ('m3','g1','outsider@example.com','pending');
insert into public.payments(id,group_id,member_id,user_email,member_name,spots,weeks,amount,receipt_url,status) values
 ('pending-own','g1','m1','member1@example.com','Member One','1',1,1000,'r1','pending'),
 ('approved-own','g1','m1','member1@example.com','Member One','1',1,1000,'r2','approved'),
 ('approved-admin-delete','g1','m1','member1@example.com','Member One','1',2,2000,'r3','approved'),
 ('other-pending','g1','m2','member2@example.com','Member Two','2',1,1000,'r4','pending');
insert into public.group_messages(id,group_id,from_email,body,payment_id,receipt_status) values
 ('receipt-pending-own','g1','member1@example.com','receipt pending','pending-own','pending'),
 ('receipt-approved-own','g1','member1@example.com','receipt approved','approved-own','approved'),
 ('receipt-admin-delete','g1','member1@example.com','receipt admin delete','approved-admin-delete','approved'),
 ('gm-member1','g1','member1@example.com','hello',null,null),
 ('gm-member2','g1','member2@example.com','hi',null,null),
 ('gm-admin','g1','admin@example.com','admin says hi',null,null);
insert into public.messages(id,from_email,to_email,body,read) values
 ('dm1','member1@example.com','member2@example.com','private hello',false),
 ('dm2','member2@example.com','member1@example.com','private reply',false);
insert into public.ads(id,status,submitter_email,approved_at,expires_at) values
 ('ad-active','approved','advertiser@example.com',now()-interval '1 day',now()+interval '1 day'),
 ('ad-ended','approved','advertiser@example.com',now()-interval '2 days',now()-interval '1 minute'),
 ('ad-pending','pending','advertiser@example.com',null,null);
