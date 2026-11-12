-- Step 1, BEFORE migration 20. Read-only: changes nothing. Prints counts only (no emails, names or numbers).
-- Every row with ok = false must be resolved before going on. Keep the "rows:" values for step 2.
select * from (
  select 'no phone number shared by several profiles' as "check",
         (select count(*) from (select phone from public.profile_private where phone is not null group by phone having count(*) > 1) d)::text as actual,
         '0' as expected,
         (select count(*) from (select phone from public.profile_private where phone is not null group by phone having count(*) > 1) d) = 0 as ok
  union all select 'every account has an email', (select count(*) from auth.users where coalesce(email, '') = '')::text, '0', (select count(*) from auth.users where coalesce(email, '') = '') = 0
  union all select 'accounts with an unconfirmed email (Confirm email is off: expect 0)', (select count(*) from auth.users where email_confirmed_at is null)::text, '0', (select count(*) from auth.users where email_confirmed_at is null) = 0
  union all select 'handle_new_user() is owned by the role running this', (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.handle_new_user()'::regprocedure), current_user, (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.handle_new_user()'::regprocedure) = current_user
  union all select 'on_auth_user_created trigger exists (migration 1)', (exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass))::text, 'true', exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass)
  union all select 'migration 20 not applied yet (no ensure_my_profile)', (to_regprocedure('public.ensure_my_profile()') is null)::text, 'true', to_regprocedure('public.ensure_my_profile()') is null
  union all select 'migration 19 not applied (no is_account_verified)', (to_regprocedure('public.is_account_verified(uuid)') is null)::text, 'true', to_regprocedure('public.is_account_verified(uuid)') is null
  union all select 'info: on_auth_user_email_confirmed exists (only if migration 10 ran)', (exists (select 1 from pg_trigger where tgname = 'on_auth_user_email_confirmed' and tgrelid = 'auth.users'::regclass))::text, 'false', null
  union all select 'info: confirmed accounts without a profile (repaired on their next visit)', (select count(*) from auth.users u where u.email_confirmed_at is not null and not exists (select 1 from public.profiles p where p.id = u.id))::text, '5 on 2026-11-12', null
  union all select 'rows: auth.users', (select count(*) from auth.users)::text, 'same in step 2', null
  union all select 'rows: profiles', (select count(*) from public.profiles)::text, 'same in step 2', null
  union all select 'rows: profile_private', (select count(*) from public.profile_private)::text, 'same in step 2', null
  union all select 'rows: profile_private with phone', (select count(*) from public.profile_private where phone is not null)::text, 'same in step 2', null
  union all select 'rows: trips', (select count(*) from public.trips)::text, 'same in step 2', null
  union all select 'rows: bookings', (select count(*) from public.bookings)::text, 'same in step 2', null
  union all select 'rows: reviews', (select count(*) from public.reviews)::text, 'same in step 2', null
  union all select 'rows: messages', (select count(*) from public.messages)::text, 'same in step 2', null
  union all select 'rows: conversations', (select count(*) from public.conversations)::text, 'same in step 2', null
  union all select 'rows: notifications', (select count(*) from public.notifications)::text, 'same in step 2', null
) t;
