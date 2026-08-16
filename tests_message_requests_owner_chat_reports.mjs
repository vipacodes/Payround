import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();

const fixture = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table public.users (
  id uuid primary key,
  email text unique not null,
  name text,
  profile_pic text,
  is_verified boolean default false,
  is_approved boolean default true,
  approval_status text default 'approved',
  is_frozen boolean default false
);
create table public.messages (
  id text primary key,
  from_email text not null,
  to_email text not null,
  body text not null,
  read boolean default false,
  created_at timestamptz default now()
);
create table public.support_threads (
  id text primary key,
  user_email text not null,
  user_name text,
  last_message text,
  last_at timestamptz,
  user_read boolean default true,
  owner_read boolean default true
);
create table public.support_messages (
  id text primary key,
  thread_id text not null,
  sender_type text not null,
  body text not null,
  read boolean default false,
  created_at timestamptz default now()
);
create table public.groups (
  id text primary key,
  name text,
  admin_email text not null
);
create table public.members (
  id text primary key,
  group_id text not null,
  member_email text not null,
  status text not null
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null,
  reporter_email text not null,
  target_type text not null,
  target_ref text not null,
  target_label text not null,
  category text not null,
  details text not null,
  status text not null default 'pending',
  owner_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_email text
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
create function public.payround_actor_email() returns text language sql stable as $$
  select nullif(lower(btrim(current_setting('request.jwt.claim.email', true))), '')
$$;
create function public.payround_is_owner() returns boolean language sql stable as $$
  select public.payround_actor_email() = 'owner@payround.test'
$$;
create function public.payround_frozen_pair_allowed(text, text) returns boolean language sql stable as $$ select true $$;
create function public.payround_actor_is_frozen() returns boolean language sql stable as $$ select false $$;

insert into public.users(id,email,name,is_frozen) values
('00000000-0000-0000-0000-000000000001','a@test.local','A',false),
('00000000-0000-0000-0000-000000000002','b@test.local','B',false),
('00000000-0000-0000-0000-000000000003','c@test.local','C',false),
('00000000-0000-0000-0000-000000000004','d@test.local','D',false),
('00000000-0000-0000-0000-000000000005','e@test.local','E',false),
('00000000-0000-0000-0000-000000000006','f@test.local','F',true),
('00000000-0000-0000-0000-000000000007','g@test.local','G',false),
('00000000-0000-0000-0000-000000000008','h@test.local','H',false),
('00000000-0000-0000-0000-000000000009','i@test.local','I Admin',false),
('00000000-0000-0000-0000-000000000010','j@test.local','J Member',false),
('00000000-0000-0000-0000-000000000011','k@test.local','K Admin',false),
('00000000-0000-0000-0000-000000000012','l@test.local','L Member',false);

-- Existing mutual A/B conversation must be accepted.
insert into public.messages(id,from_email,to_email,body,created_at) values
('old-ab-1','a@test.local','b@test.local','hello','2026-01-01T00:00:00Z'),
('old-ab-2','b@test.local','a@test.local','reply','2026-01-01T00:01:00Z');
-- Existing one-way C/D conversation must be pending with C as requester.
insert into public.messages(id,from_email,to_email,body,created_at) values
('old-cd-1','c@test.local','d@test.local','request','2026-01-02T00:00:00Z');
-- Existing administrator-to-member chat must remain immediately accepted.
insert into public.messages(id,from_email,to_email,body,created_at) values
('old-ij-1','i@test.local','j@test.local','administrator notice','2026-01-03T00:00:00Z');
insert into public.groups(id,name,admin_email) values
('group-report-target','Report Target Group','h@test.local'),
('group-admin-history','Historical Admin Group','i@test.local'),
('group-admin-new','New Admin Group','k@test.local');
insert into public.members(id,group_id,member_email,status) values
('member-j','group-admin-history','j@test.local','approved'),
('member-l','group-admin-new','l@test.local','active');
`;

await db.exec(fixture);
const migrationPath = process.env.MESSAGE_REQUEST_MIGRATION
  || new URL('./supabase_message_requests_owner_chat_report_notifications.sql', import.meta.url);
const migration = await readFile(migrationPath, 'utf8');
await db.exec(migration);

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const setActor = async (id, email) => {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.email', $2, false)`, [id, email]);
};

// Backfill preserves established chats and locks historical one-way chats.
assert.equal((await one(`select status from direct_message_requests where participant_low=$1 and participant_high=$2`, [
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
])).status, 'accepted');
const oldOneWay = await one(`select status, requester_user_id::text, recipient_user_id::text, first_message_id from direct_message_requests where participant_low=$1 and participant_high=$2`, [
  '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004',
]);
assert.deepEqual(oldOneWay, {
  status: 'pending',
  requester_user_id: '00000000-0000-0000-0000-000000000003',
  recipient_user_id: '00000000-0000-0000-0000-000000000004',
  first_message_id: 'old-cd-1',
});
const historicalAdminChat = await one(`select status from direct_message_requests where requester_user_id=$1 and recipient_user_id=$2`, [
  '00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000010',
]);
assert.equal(historicalAdminChat.status, 'accepted');

// A group administrator can message an approved/active member immediately;
// the accepted conversation then allows the member to reply normally.
await setActor('00000000-0000-0000-0000-000000000011', 'k@test.local');
const adminFirst = await one(`select public.send_my_direct_message($1,$2) as result`, [
  '00000000-0000-0000-0000-000000000012', 'Administrator message without waiting',
]);
assert.equal(adminFirst.result.request.status, 'accepted');
await db.query(`insert into public.messages(id,from_email,to_email,body) values('k-second','k@test.local','l@test.local','second administrator message')`);
await setActor('00000000-0000-0000-0000-000000000012', 'l@test.local');
await db.query(`insert into public.messages(id,from_email,to_email,body) values('l-reply','l@test.local','k@test.local','member reply')`);

// The first E->F message succeeds; sender message two and recipient reply fail.
await setActor('00000000-0000-0000-0000-000000000005', 'e@test.local');
const first = await one(`select public.send_my_direct_message($1,$2) as result`, [
  '00000000-0000-0000-0000-000000000006', 'first hello',
]);
assert.equal(first.result.request.status, 'pending');
assert.equal(first.result.request.role, 'requester');
assert.equal(first.result.request.can_send, false);
await assert.rejects(
  () => db.query(`select public.send_my_direct_message($1,$2)`, ['00000000-0000-0000-0000-000000000006', 'second blocked']),
  /pending/i,
);
await setActor('00000000-0000-0000-0000-000000000006', 'f@test.local');
await assert.rejects(
  () => db.query(`insert into public.messages(id,from_email,to_email,body) values('f-reply-blocked','f@test.local','e@test.local','reply')`),
  /Accept this message request/i,
);

// A requester cannot answer their own request. Recipient acceptance unlocks both ways.
await setActor('00000000-0000-0000-0000-000000000005', 'e@test.local');
await assert.rejects(
  () => db.query(`select public.respond_to_direct_message_request($1,true)`, [first.result.request.id]),
  /Only the message recipient/i,
);
await setActor('00000000-0000-0000-0000-000000000006', 'f@test.local');
const accepted = await one(`select public.respond_to_direct_message_request($1,true) as result`, [first.result.request.id]);
assert.equal(accepted.result.status, 'accepted');
await db.query(`insert into public.messages(id,from_email,to_email,body) values('f-reply-ok','f@test.local','e@test.local','accepted reply')`);
await setActor('00000000-0000-0000-0000-000000000005', 'e@test.local');
await db.query(`select public.send_my_direct_message($1,$2)`, ['00000000-0000-0000-0000-000000000006', 'second now allowed']);

// Direct table inserts are also guarded, and declined requests stay closed.
await setActor('00000000-0000-0000-0000-000000000007', 'g@test.local');
await db.query(`insert into public.messages(id,from_email,to_email,body) values('g-first','g@test.local','h@test.local','one')`);
await assert.rejects(
  () => db.query(`insert into public.messages(id,from_email,to_email,body) values('g-second','g@test.local','h@test.local','two')`),
  /pending/i,
);
const gh = await one(`select id::text from direct_message_requests where requester_user_id=$1 and recipient_user_id=$2`, [
  '00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000008',
]);
// Deleting the initial message must not erase the pending request or its inbox peer.
await db.query(`delete from public.messages where id='g-first'`);
assert.equal((await one(`select status from direct_message_requests where id=$1`, [gh.id])).status, 'pending');
const gPeers = (await db.query(`select email from public.get_my_direct_message_people()`)).rows.map(row => row.email);
assert.ok(gPeers.includes('h@test.local'));
await setActor('00000000-0000-0000-0000-000000000008', 'h@test.local');
const hContext = await one(`select public.get_direct_message_request_context('g@test.local') as result`);
assert.equal(hContext.result.status, 'pending');
assert.equal(hContext.result.role, 'recipient');
const declined = await one(`select public.respond_to_direct_message_request($1,false) as result`, [gh.id]);
assert.equal(declined.result.status, 'declined');
await setActor('00000000-0000-0000-0000-000000000007', 'g@test.local');
await assert.rejects(
  () => db.query(`insert into public.messages(id,from_email,to_email,body) values('g-after-decline','g@test.local','h@test.local','blocked')`),
  /declined/i,
);

// Owner profile action opens one Support thread even for a frozen user.
await setActor('99999999-9999-9999-9999-999999999999', 'owner@payround.test');
const support1 = await one(`select public.owner_open_user_support_chat($1) as result`, ['00000000-0000-0000-0000-000000000006']);
const support2 = await one(`select public.owner_open_user_support_chat($1) as result`, ['00000000-0000-0000-0000-000000000006']);
assert.equal(support1.result.id, support2.result.id);
assert.equal(Number((await one(`select count(*)::int as n from support_threads where user_email='f@test.local'`)).n), 1);

// Owner can deliberately notify reporter + reported user; no report evidence is auto-added.
const report = await one(`insert into public.reports(reporter_user_id,reporter_email,target_type,target_ref,target_label,category,details)
  values($1,'e@test.local','user',$2,'F','harassment','private evidence stays owner-only') returning id::text`, [
  '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000006',
]);
const notified = await one(`select public.owner_send_report_notification($1,'both','Please review your PayRound account notice.') as result`, [report.id]);
assert.equal(notified.result.sent, 2);
const notices = (await db.query(`select user_email,message from notifications where type='owner_report_message' order by user_email`)).rows;
assert.deepEqual(notices.map(row => row.user_email), ['e@test.local', 'f@test.local']);
assert.ok(notices.every(row => row.message === '💬 PayRound: Please review your PayRound account notice.'));
assert.ok(notices.every(row => !row.message.includes('private evidence')));
await assert.rejects(
  () => db.query(`select public.owner_send_report_notification($1,'reported','The reporter was e@test.local')`, [report.id]),
  /Remove reporter identity/i,
);
await assert.rejects(
  () => db.query(`select public.owner_send_report_notification($1,'reported','private evidence stays owner-only')`, [report.id]),
  /private report evidence/i,
);

// For a reported group, the reported-party recipient is the group's admin.
const groupReport = await one(`insert into public.reports(reporter_user_id,reporter_email,target_type,target_ref,target_label,category,details)
  values($1,'e@test.local','group','group-report-target','Report Target Group','group_rules','separate private group evidence') returning id::text`, [
  '00000000-0000-0000-0000-000000000005',
]);
const groupNotice = await one(`select public.owner_send_report_notification($1,'reported','Please review your group rules.') as result`, [groupReport.id]);
assert.equal(groupNotice.result.sent, 1);
const adminNotice = await one(`select user_email,group_id from notifications where user_email='h@test.local' and type='owner_report_message'`);
assert.deepEqual(adminNotice, { user_email: 'h@test.local', group_id: 'group-report-target' });

await setActor('00000000-0000-0000-0000-000000000005', 'e@test.local');
await assert.rejects(
  () => db.query(`select public.owner_send_report_notification($1,'reporter','unauthorized')`, [report.id]),
  /owner access required/i,
);

console.log('PASS: message requests, group-admin member bypass, direct-insert enforcement, owner Support chat, and report notifications.');
await db.close();
