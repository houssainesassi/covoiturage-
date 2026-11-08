-- =============================================================================
-- Driver phone access (requires migration 8).
--
-- A driver's number is shown to signed-in users so they can call about a ride,
-- and only while that driver has a ride open for booking. Guests and scrapers
-- using the public API key cannot read numbers. Confirmed passengers keep access
-- after departure through get_trip_contacts().
-- =============================================================================

create or replace function public.get_driver_phones(p_driver_ids uuid[])
returns table (driver_id uuid, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select pp.id, pp.phone
  from public.profile_private pp
  where auth.uid() is not null
    and pp.id = any (p_driver_ids[1:100])
    and pp.phone is not null
    and exists (
      select 1 from public.trips t
      where t.driver_id = pp.id and t.status = 'scheduled' and t.departure_at > now()
    );
$$;
revoke all on function public.get_driver_phones(uuid[]) from public, anon;
grant execute on function public.get_driver_phones(uuid[]) to authenticated;
