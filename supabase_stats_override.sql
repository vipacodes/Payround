-- Add stats override columns to owner_settings for editable stats that reflect on user site
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/biqutnjvhkvldrihywdb/sql/new

alter table owner_settings add column if not exists total_users_override integer;
alter table owner_settings add column if not exists total_groups_override integer;
alter table owner_settings add column if not exists total_saved_override text;
alter table owner_settings add column if not exists satisfaction_override text;

-- Update existing row to have real counts as initial override (optional)
-- This makes stats editable from owner site and reflects on user site payround-omega instantly

-- Example: set initial real stats (will be auto-updated from real counts if you don't override)
-- You can run this to set initial values:
-- update owner_settings set total_users_override = (select count(*) from users), total_groups_override = (select count(*) from groups where status='active'), total_saved_override = '₦0+', satisfaction_override = '100%' where id=1;

-- Verify columns added
select * from owner_settings where id=1;
