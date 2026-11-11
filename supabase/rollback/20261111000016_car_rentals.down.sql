-- Rollback of migration 16 (car rentals). Deletes every rental listing.
-- Photos in the 'rentals' bucket must be removed through the Storage API first
-- (Supabase blocks direct deletes from storage.objects).
drop policy if exists "rentals_read_own_folder" on storage.objects;
drop policy if exists "rentals_insert_own_folder" on storage.objects;
drop policy if exists "rentals_delete_own_folder" on storage.objects;
drop function if exists public.admin_set_rental_status(uuid, public.rental_status, text);
drop table if exists public.rental_listings;
drop function if exists public.rental_listings_validate();
drop type if exists public.rental_status;
