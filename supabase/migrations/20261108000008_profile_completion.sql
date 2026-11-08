-- =============================================================================
-- Mandatory profile completion + public driver phone numbers.
--
-- A profile is complete when it has a name (>= 2 chars), an avatar and a valid
-- Tunisian phone number. Incomplete (non-demo) accounts can neither publish a
-- ride nor book a seat. Drivers' phone numbers are shown on their ride posts.
-- =============================================================================

create or replace function public.is_profile_complete(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select char_length(trim(p.full_name)) >= 2
       and p.avatar_path is not null
       and pp.phone is not null
    from public.profiles p
    left join public.profile_private pp on pp.id = p.id
    where p.id = p_user_id
  ), false);
$$;
revoke all on function public.is_profile_complete(uuid) from public, anon, authenticated;

-- Current user's completion status (used by the app to gate navigation).
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

-- Phone numbers of the given drivers, only for users who actually post rides.
-- Passengers' numbers stay private (revealed via get_trip_contacts only).
create or replace function public.get_driver_phones(p_driver_ids uuid[])
returns table (driver_id uuid, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select pp.id, pp.phone
  from public.profile_private pp
  where pp.id = any (p_driver_ids[1:100])
    and pp.phone is not null
    and exists (select 1 from public.trips t where t.driver_id = pp.id and t.status <> 'cancelled');
$$;
revoke all on function public.get_driver_phones(uuid[]) from public;
grant execute on function public.get_driver_phones(uuid[]) to anon, authenticated;

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

create trigger trips_b_require_complete_profile before insert on public.trips
  for each row when (not new.is_demo) execute function public.require_complete_profile('driver_id');
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
create trigger profile_private_keep_phone before update of phone on public.profile_private
  for each row execute function public.profile_private_keep_phone();
