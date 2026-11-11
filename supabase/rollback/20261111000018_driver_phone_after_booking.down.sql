-- =============================================================================
-- Rollback of migration 18. Back to the migration 9 rule: the driver's number only
-- for passengers with a confirmed or completed booking. Nothing else changes.
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
    where trip_id = p_trip_id and passenger_id = v_uid and status in ('confirmed', 'completed')
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

revoke all on function public.get_trip_contacts(uuid) from public, anon;
grant execute on function public.get_trip_contacts(uuid) to authenticated;
