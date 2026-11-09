-- =============================================================================
-- Driver phone privacy.
--
-- There is deliberately no bulk phone lookup. A driver's number is available only
-- through get_trip_contacts(), to passengers with a confirmed or completed booking
-- on that driver's ride. Before that, people use in-app messages.
--
-- An earlier draft of migration 8 created get_driver_phones(). This removes it
-- from any database that ran that draft; elsewhere it does nothing.
--
-- Rollback: supabase/rollback/20261108000009_driver_phone_access.down.sql
-- =============================================================================

drop function if exists public.get_driver_phones(uuid[]);
