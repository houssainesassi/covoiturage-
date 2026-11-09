-- Read-only report to run in the SQL Editor BEFORE migrations 8-13. Changes nothing.
-- Each statement is a separate result: run them one at a time. Lists ids and problem
-- types only, so the results don't expose names or phone numbers.

-- 1. Summary.
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

-- 2. Accounts with no profile. Migration 11 restores the confirmed ones.
select u.id, u.email_confirmed_at is not null as confirmed
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- 3. Real users who will be asked to complete their profile, and why.
--    recoverable_* means migration 11 can fill the value from signup data.
select
  p.id,
  p.role::text as role,
  char_length(trim(p.full_name)) < 2 as bad_name,
  char_length(trim(coalesce(u.raw_user_meta_data ->> 'full_name', ''))) >= 2 as recoverable_name,
  p.avatar_path is null as no_avatar,
  p.avatar_path is not null and not exists (
    select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = p.avatar_path
  ) as avatar_file_missing,
  pp.phone is null as no_phone,
  pp.phone is not null and pp.phone !~ '^\+216[2-9][0-9]{7}$' as invalid_phone,
  coalesce(u.raw_user_meta_data ->> 'phone' ~ '^\+216[2-9][0-9]{7}$', false) as recoverable_phone,
  (select count(*) from public.trips t where t.driver_id = p.id and t.status = 'scheduled' and t.departure_at > now()) as open_trips,
  (select count(*) from public.bookings b where b.passenger_id = p.id and b.status in ('pending', 'confirmed')) as active_bookings
from public.profiles p
left join public.profile_private pp on pp.id = p.id
left join auth.users u on u.id = p.id
where not p.is_demo
  and (
    char_length(trim(p.full_name)) < 2
    or pp.phone is null
    or pp.phone !~ '^\+216[2-9][0-9]{7}$'
    or not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = p.avatar_path)
  )
order by open_trips desc, active_bookings desc;

-- 4. Should return no rows. Any row means 8 or 10 was already partly applied: stop and investigate.
select tgname
from pg_catalog.pg_trigger
where not tgisinternal
  and tgname in (
    'trips_b_require_complete_profile', 'bookings_require_complete_profile',
    'profiles_keep_avatar', 'profile_private_keep_phone', 'on_auth_user_email_confirmed'
  );

-- 5. Must show the [2-9] rule from migration 1. Anything else: stop and investigate.
select pg_get_constraintdef(oid) as phone_rule
from pg_catalog.pg_constraint
where conname = 'profile_private_phone_check' and conrelid = 'public.profile_private'::regclass;

-- 6. Suspension reasons to preserve. Works before migration 13 only.
select count(*) as reasons_to_preserve from public.profiles where suspended_reason is not null;
