-- Read-only report to run in the SQL Editor AFTER migrations 8-13. Changes nothing.
-- Each statement is a separate result: run them one at a time.

-- 1. Compare with result 1 of preflight.sql. users_without_profile and
--    profiles_without_private_row may drop to 0. Everything else must match.
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from auth.users where email_confirmed_at is null) as unconfirmed_users,
  (select count(*) from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)) as users_without_profile,
  (select count(*) from public.profiles where not is_demo) as real_profiles,
  (select count(*) from public.profiles p where not is_demo and not exists (select 1 from public.profile_private pp where pp.id = p.id)) as profiles_without_private_row,
  (select count(*) from public.profiles where role = 'admin') as admins,
  (select count(*) from public.profiles where status = 'suspended') as suspended_users,
  (select count(*) from public.trips where not is_demo) as real_trips,
  (select count(*) from public.bookings where not is_demo) as real_bookings,
  (select count(*) from public.bookings where not is_demo and status in ('pending', 'confirmed')) as active_bookings;

-- 2. Every column must be true, and triggers must be 5.
select
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'suspended_reason'
  ) as public_column_gone,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profile_private' and column_name = 'suspended_reason'
  ) as private_column_added,
  to_regprocedure('public.get_driver_phones(uuid[])') is null as bulk_phone_lookup_gone,
  (select count(*)::int from pg_catalog.pg_trigger where not tgisinternal and tgname in (
    'trips_b_require_complete_profile', 'bookings_require_complete_profile',
    'profiles_keep_avatar', 'profile_private_keep_phone', 'on_auth_user_email_confirmed'
  )) as triggers;

-- 3. Must equal reasons_to_preserve from result 6 of preflight.sql.
select count(*) as reasons_preserved from public.profile_private where suspended_reason is not null;

-- 4. Must show the [2-9] rule.
select pg_get_constraintdef(oid) as phone_rule
from pg_catalog.pg_constraint
where conname = 'profile_private_phone_check' and conrelid = 'public.profile_private'::regclass;
