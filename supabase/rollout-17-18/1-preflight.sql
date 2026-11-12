-- Step 1, BEFORE migration 17. Read-only: changes nothing.
-- Every row with ok = false must be explained before going on. Keep the row counts.
select * from (
  select 'database is at migration 7 (no migration 8+ function)' as "check",
         (not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'my_profile_complete'))::text as actual, 'true' as expected,
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'my_profile_complete') as ok
  union all select 'get_trip_contacts exists', (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'get_trip_contacts'))::text, 'true', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'get_trip_contacts')
  union all select 'get_trip_contacts already gives pending (migration 18)', (position('''pending''' in pg_get_functiondef('public.get_trip_contacts(uuid)'::regprocedure)) > 0)::text, 'false', position('''pending''' in pg_get_functiondef('public.get_trip_contacts(uuid)'::regprocedure)) = 0
  union all select 'get_public_driver_phones exists (migration 17)', (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'get_public_driver_phones'))::text, 'false', not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'get_public_driver_phones')
  union all select 'profile_private.phone_public exists (migration 17)', (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profile_private' and column_name = 'phone_public'))::text, 'false', not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profile_private' and column_name = 'phone_public')
  union all select 'table phone_reveals exists (migration 17)', (to_regclass('public.phone_reveals') is not null)::text, 'false', to_regclass('public.phone_reveals') is null
  union all select 'admin_list_users exists (migration 7, re-granted by 17)', (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_list_users'))::text, 'true', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_list_users')
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
