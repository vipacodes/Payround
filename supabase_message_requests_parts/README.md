# Phone-friendly migration parts

Use these only when the full `supabase_message_requests_owner_chat_report_notifications.sql` file is too large for the Supabase SQL Editor on a phone.

Run the five numbered `.sql` files **in order**, waiting for a successful result after each one. Each part has its own transaction and is safe to rerun. Do not deploy both the full migration and these parts; they contain the same definitions.

1. `01_request_table_backfill_and_trigger.sql`
2. `02_request_read_functions.sql`
3. `03_request_response_send_and_grants.sql`
4. `04_owner_profile_support_chat.sql`
5. `05_owner_report_notifications.sql`

After all five succeed, deploy the user and owner frontend commits.
