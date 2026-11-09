-- Reverts migration 8. Saved names, avatars and phone numbers are kept.
-- Run after the rollbacks for 10 and 9.

drop trigger if exists trips_b_require_complete_profile on public.trips;
drop trigger if exists bookings_require_complete_profile on public.bookings;
drop trigger if exists profiles_keep_avatar on public.profiles;
drop trigger if exists profile_private_keep_phone on public.profile_private;

drop function if exists public.require_complete_profile();
drop function if exists public.profiles_keep_avatar();
drop function if exists public.profile_private_keep_phone();
drop function if exists public.my_profile_complete();
drop function if exists public.is_profile_complete(uuid);
