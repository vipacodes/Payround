-- Remove every signed user from user site as requested
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/biqutnjvhkvldrihywdb/sql/new

-- Delete all users (except owner emails, keep owners)
delete from users where email not in ('vipadarapper@gmail.com', 'payroundsupport@gmail.com');

-- Delete all groups (real groups only, no demo already deleted)
-- Uncomment if you want to delete all groups too:
-- delete from member_receipts;
-- delete from groups;

-- Verify empty
select count(*) as remaining_users from users;
select count(*) as remaining_groups from groups;
