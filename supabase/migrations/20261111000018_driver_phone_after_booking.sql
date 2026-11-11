-- =============================================================================
-- Migration 18: a passenger sees the driver's number as soon as they book.
--
-- Before: get_trip_contacts() gave the driver's number only to passengers with a
-- CONFIRMED (or completed) booking, so a request waiting for the driver showed none.
-- Now: a PENDING booking is enough. The product owner chose this so passengers can
-- call right after booking, without waiting for the driver to accept.
--
-- Unchanged:
--   * rejected or cancelled bookings get nothing (access ends with the booking);
--   * strangers and guests get nothing (anon has no EXECUTE);
--   * the driver still sees passengers' numbers only for confirmed bookings;
--   * request_booking() still limits a passenger to 10 requests an hour and one
--     open booking per ride.
-- Trade-off, accepted: anyone who sends a request can see that driver's number,
-- even if the driver then declines.
--
-- Rollback: supabase/rollback/20261111000018_driver_phone_after_booking.down.sql
-- =============================================================================

create or replace function public.get_trip_contacts(p_trip_id uuid)
returns table (user_id uuid, full_name text, phone text, role text, plate_number text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_trip public.trips%rowtype;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  if not found or v_uid is null then
    return;
  end if;

  if v_uid = v_trip.driver_id or public.is_admin() then
    return query
      select b.passenger_id, p.full_name, pp.phone, 'passenger'::text, null::text
      from public.bookings b
      join public.profiles p on p.id = b.passenger_id
      left join public.profile_private pp on pp.id = b.passenger_id
      where b.trip_id = p_trip_id and b.status in ('confirmed', 'completed');
  elsif exists (
    select 1 from public.bookings
    where trip_id = p_trip_id and passenger_id = v_uid and status in ('pending', 'confirmed', 'completed')
  ) then
    return query
      select v_trip.driver_id, p.full_name, pp.phone, 'driver'::text, v.plate_number
      from public.profiles p
      left join public.profile_private pp on pp.id = p.id
      left join public.vehicles v on v.id = v_trip.vehicle_id
      where p.id = v_trip.driver_id;
  end if;
end;
$$;

-- create or replace keeps existing grants; re-asserted so the intent is explicit.
revoke all on function public.get_trip_contacts(uuid) from public, anon;
grant execute on function public.get_trip_contacts(uuid) to authenticated;
