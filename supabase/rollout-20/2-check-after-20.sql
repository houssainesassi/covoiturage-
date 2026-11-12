-- Step 2, AFTER migration 20. Read-only. Every ok must be true; every "rows:" value equal to step 1.
select * from (
  select 'unique index profile_private_phone_key exists' as "check",
         (exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'profile_private_phone_key'))::text as actual, 'true' as expected,
         exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'profile_private_phone_key') as ok
  union all select 'index is partial (phone is not null) and unique', (select pg_get_indexdef('public.profile_private_phone_key'::regclass)), 'CREATE UNIQUE INDEX … WHERE (phone IS NOT NULL)', (select pg_get_indexdef('public.profile_private_phone_key'::regclass)) ilike 'CREATE UNIQUE INDEX%WHERE (phone IS NOT NULL)'
  union all select 'handle_new_user waits for email confirmation', (position('email_confirmed_at is null' in pg_get_functiondef('public.handle_new_user()'::regprocedure)) > 0)::text, 'true', position('email_confirmed_at is null' in pg_get_functiondef('public.handle_new_user()'::regprocedure)) > 0
  union all select 'trigger on_auth_user_created', (exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass))::text, 'true', exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass)
  union all select 'trigger on_auth_user_email_confirmed', (exists (select 1 from pg_trigger where tgname = 'on_auth_user_email_confirmed' and tgrelid = 'auth.users'::regclass))::text, 'true', exists (select 1 from pg_trigger where tgname = 'on_auth_user_email_confirmed' and tgrelid = 'auth.users'::regclass)
  union all select 'definer functions have search_path=""', (select count(*) from pg_proc where oid in ('public.handle_new_user()'::regprocedure, 'public.create_profile_rows(uuid,jsonb)'::regprocedure, 'public.ensure_my_profile()'::regprocedure) and prosecdef and 'search_path=""' = any (proconfig))::text, '3', (select count(*) from pg_proc where oid in ('public.handle_new_user()'::regprocedure, 'public.create_profile_rows(uuid,jsonb)'::regprocedure, 'public.ensure_my_profile()'::regprocedure) and prosecdef and 'search_path=""' = any (proconfig)) = 3
  union all select 'guests cannot run ensure_my_profile', (not has_function_privilege('anon', 'public.ensure_my_profile()', 'EXECUTE'))::text, 'true', not has_function_privilege('anon', 'public.ensure_my_profile()', 'EXECUTE')
  union all select 'members can run ensure_my_profile', has_function_privilege('authenticated', 'public.ensure_my_profile()', 'EXECUTE')::text, 'true', has_function_privilege('authenticated', 'public.ensure_my_profile()', 'EXECUTE')
  union all select 'nobody can call create_profile_rows through the API', (not has_function_privilege('anon', 'public.create_profile_rows(uuid,jsonb)', 'EXECUTE') and not has_function_privilege('authenticated', 'public.create_profile_rows(uuid,jsonb)', 'EXECUTE'))::text, 'true', not has_function_privilege('anon', 'public.create_profile_rows(uuid,jsonb)', 'EXECUTE') and not has_function_privilege('authenticated', 'public.create_profile_rows(uuid,jsonb)', 'EXECUTE')
  union all select 'guests cannot read profile_private', (not has_table_privilege('anon', 'public.profile_private', 'SELECT'))::text, 'true', not has_table_privilege('anon', 'public.profile_private', 'SELECT')
  union all select 'RLS on profiles and profile_private', (select bool_and(relrowsecurity) from pg_class where oid in ('public.profiles'::regclass, 'public.profile_private'::regclass))::text, 'true', (select bool_and(relrowsecurity) from pg_class where oid in ('public.profiles'::regclass, 'public.profile_private'::regclass))
  union all select 'rows: auth.users', (select count(*) from auth.users)::text, 'same as step 1', null
  union all select 'rows: profiles', (select count(*) from public.profiles)::text, 'same as step 1', null
  union all select 'rows: profile_private', (select count(*) from public.profile_private)::text, 'same as step 1', null
  union all select 'rows: profile_private with phone', (select count(*) from public.profile_private where phone is not null)::text, 'same as step 1', null
  union all select 'rows: trips', (select count(*) from public.trips)::text, 'same as step 1', null
  union all select 'rows: bookings', (select count(*) from public.bookings)::text, 'same as step 1', null
  union all select 'rows: reviews', (select count(*) from public.reviews)::text, 'same as step 1', null
  union all select 'rows: messages', (select count(*) from public.messages)::text, 'same as step 1', null
  union all select 'rows: conversations', (select count(*) from public.conversations)::text, 'same as step 1', null
  union all select 'rows: notifications', (select count(*) from public.notifications)::text, 'same as step 1', null
) t;
