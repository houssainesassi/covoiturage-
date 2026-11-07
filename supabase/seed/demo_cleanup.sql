-- Removes ALL demo data (is_demo = true). Real data is never touched.
begin;
delete from public.reviews  where is_demo;
delete from public.bookings where is_demo;
delete from public.trips    where is_demo;
delete from public.vehicles where is_demo;
delete from public.profiles where is_demo;
commit;
