-- =============================================================================
-- Mandatory profile completion before publishing a ride or booking a seat.
--
-- A profile is complete when it has a name (>= 2 chars), an avatar that really
-- exists in storage and a valid Tunisian phone number. Browsing stays open to
-- everyone; only the writes below are blocked. Existing trips and bookings are
-- not touched, because the triggers fire on insert only.
--
-- Rollback: supabase/rollback/20261108000008_profile_completion.down.sql
-- =============================================================================

-- The phone rule below matches profile_private_phone_check from migration 1. Keep
-- it in sync with TN_PHONE_REGEX in src/lib/phone.ts and migrations 10 and 11.
create or replace function public.is_profile_complete(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select char_length(trim(p.full_name)) >= 2
       and pp.phone ~ '^\+216[2-9][0-9]{7}$'
       -- avatar_path is client-writable, so a path alone proves nothing.
       and exists (
         select 1 from storage.objects o
         where o.bucket_id = 'avatars' and o.name = p.avatar_path
       )
    from public.profiles p
    left join public.profile_private pp on pp.id = p.id
    where p.id = p_user_id
  ), false);
$$;
revoke all on function public.is_profile_complete(uuid) from public, anon, authenticated;

-- Current user's completion status (used by the app to explain the requirement).
create or replace function public.my_profile_complete()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_profile_complete(auth.uid());
$$;
revoke all on function public.my_profile_complete() from public, anon;
grant execute on function public.my_profile_complete() to authenticated;

-- Server-side enforcement: incomplete profiles cannot publish or book.
create or replace function public.require_complete_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- tg_argv[0] names the column holding the acting user (driver_id / passenger_id).
  v_user uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  if not public.is_profile_complete(v_user) then
    raise exception 'profile_incomplete' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trips_b_require_complete_profile on public.trips;
create trigger trips_b_require_complete_profile before insert on public.trips
  for each row when (not new.is_demo) execute function public.require_complete_profile('driver_id');
drop trigger if exists bookings_require_complete_profile on public.bookings;
create trigger bookings_require_complete_profile before insert on public.bookings
  for each row when (not new.is_demo) execute function public.require_complete_profile('passenger_id');

-- An avatar cannot be removed once set (it is a mandatory profile field).
create or replace function public.profiles_keep_avatar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.avatar_path is not null and new.avatar_path is null and not new.is_demo then
    raise exception 'avatar_required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_keep_avatar on public.profiles;
create trigger profiles_keep_avatar before update of avatar_path on public.profiles
  for each row execute function public.profiles_keep_avatar();

-- Same for the phone number.
create or replace function public.profile_private_keep_phone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.phone is not null and new.phone is null then
    raise exception 'phone_required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists profile_private_keep_phone on public.profile_private;
create trigger profile_private_keep_phone before update of phone on public.profile_private
  for each row execute function public.profile_private_keep_phone();
