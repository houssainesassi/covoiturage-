-- Step 5, AFTER migration 18. Read-only. Expected: every ok = true, row counts equal to step 1.
select * from (
  select 'get_trip_contacts gives the number for pending bookings' as "check", (position('''pending''' in pg_get_functiondef('public.get_trip_contacts(uuid)'::regprocedure)) > 0)::text as actual, 'true' as expected, position('''pending''' in pg_get_functiondef('public.get_trip_contacts(uuid)'::regprocedure)) > 0 as ok
  union all select 'guests cannot call get_trip_contacts', has_function_privilege('anon', 'public.get_trip_contacts(uuid)', 'EXECUTE')::text, 'false', not has_function_privilege('anon', 'public.get_trip_contacts(uuid)', 'EXECUTE')
  union all select 'members can call get_trip_contacts', has_function_privilege('authenticated', 'public.get_trip_contacts(uuid)', 'EXECUTE')::text, 'true', has_function_privilege('authenticated', 'public.get_trip_contacts(uuid)', 'EXECUTE')
  union all select 'migration 17 still in place', (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'get_public_driver_phones'))::text, 'true', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'get_public_driver_phones')
  union all select 'migration 19 NOT applied (no sign-up hook function)', (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'hook_before_user_created'))::text, 'false', not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'hook_before_user_created')
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
