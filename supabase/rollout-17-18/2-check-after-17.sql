-- Step 3, AFTER migration 17. Read-only. Expected: every ok = true, row counts equal to step 1.
select * from (
  select 'get_public_driver_phones exists' as "check", (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'get_public_driver_phones'))::text as actual, 'true' as expected, exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'get_public_driver_phones') as ok
  union all select 'set_my_phone_public exists', (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_my_phone_public'))::text, 'true', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_my_phone_public')
  union all select 'consent columns added', (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profile_private' and column_name = 'phone_public') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profile_private' and column_name = 'phone_public_at'))::text, 'true', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profile_private' and column_name = 'phone_public') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profile_private' and column_name = 'phone_public_at')
  union all select 'nobody shows their number yet (opt-in only)', (select count(*) from public.profile_private where phone_public)::text, '0', (select count(*) from public.profile_private where phone_public) = 0
  union all select 'phone_reveals exists and is empty', coalesce((select count(*) from public.phone_reveals)::text, 'missing'), '0', (select count(*) from public.phone_reveals) = 0
  union all select 'consent reset trigger exists', exists (select 1 from pg_trigger where tgname = 'profile_private_reset_phone_consent')::text, 'true', exists (select 1 from pg_trigger where tgname = 'profile_private_reset_phone_consent')
  union all select 'guests cannot read numbers', has_function_privilege('anon', 'public.get_public_driver_phones(uuid[])', 'EXECUTE')::text, 'false', not has_function_privilege('anon', 'public.get_public_driver_phones(uuid[])', 'EXECUTE')
  union all select 'guests cannot read profile_private', has_table_privilege('anon', 'public.profile_private', 'SELECT')::text, 'false', not has_table_privilege('anon', 'public.profile_private', 'SELECT')
  union all select 'guests cannot list users (admin)', has_function_privilege('anon', 'public.admin_list_users(text, public.account_status, public.user_role, integer, integer)', 'EXECUTE')::text, 'false', not has_function_privilege('anon', 'public.admin_list_users(text, public.account_status, public.user_role, integer, integer)', 'EXECUTE')
  union all select 'members can call get_public_driver_phones', has_function_privilege('authenticated', 'public.get_public_driver_phones(uuid[])', 'EXECUTE')::text, 'true', has_function_privilege('authenticated', 'public.get_public_driver_phones(uuid[])', 'EXECUTE')
  union all select 'members can still save their phone (app)', (has_column_privilege('authenticated', 'public.profile_private', 'phone', 'UPDATE') and has_column_privilege('authenticated', 'public.profile_private', 'phone', 'INSERT'))::text, 'true', has_column_privilege('authenticated', 'public.profile_private', 'phone', 'UPDATE') and has_column_privilege('authenticated', 'public.profile_private', 'phone', 'INSERT')
  union all select 'members cannot write consent directly', has_column_privilege('authenticated', 'public.profile_private', 'phone_public', 'UPDATE')::text, 'false', not has_column_privilege('authenticated', 'public.profile_private', 'phone_public', 'UPDATE')
  union all select 'get_trip_contacts unchanged (no pending yet)', (position('''pending''' in pg_get_functiondef('public.get_trip_contacts(uuid)'::regprocedure)) > 0)::text, 'false', position('''pending''' in pg_get_functiondef('public.get_trip_contacts(uuid)'::regprocedure)) = 0
  union all select 'rows: auth.users', (select count(*) from auth.users)::text, 'same as step 1', null
  union all select 'rows: profiles', (select count(*) from public.profiles)::text, 'same as step 1', null
  union all select 'rows: profile_private', (select count(*) from public.profile_private)::text, 'same as step 1', null
  union all select 'rows: profile_private with phone', (select count(*) from public.profile_private where phone is not null)::text, 'same as step 1', null
  union all select 'rows: vehicles', (select count(*) from public.vehicles)::text, 'same as step 1', null
  union all select 'rows: trips', (select count(*) from public.trips)::text, 'same as step 1', null
  union all select 'rows: trips scheduled', (select count(*) from public.trips where status = 'scheduled')::text, 'same as step 1', null
  union all select 'rows: bookings', (select count(*) from public.bookings)::text, 'same as step 1', null
  union all select 'rows: bookings pending', (select count(*) from public.bookings where status = 'pending')::text, 'same as step 1', null
  union all select 'rows: bookings confirmed', (select count(*) from public.bookings where status = 'confirmed')::text, 'same as step 1', null
  union all select 'rows: messages', (select count(*) from public.messages)::text, 'same as step 1', null
  union all select 'rows: notifications', (select count(*) from public.notifications)::text, 'same as step 1', null
  union all select 'rows: reviews', (select count(*) from public.reviews)::text, 'same as step 1', null
) t;
