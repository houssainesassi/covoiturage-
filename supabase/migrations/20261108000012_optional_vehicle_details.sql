-- =============================================================================
-- A vehicle's type, brand and color are optional, so drivers can publish faster.
-- Existing values are kept. The length checks on brand and color stay: they still
-- apply to a value when one is given, and they allow null.
--
-- Rollback: supabase/rollback/20261108000012_optional_vehicle_details.down.sql
-- =============================================================================

alter table public.vehicles alter column type drop not null;
alter table public.vehicles alter column type drop default;
alter table public.vehicles alter column brand drop not null;
alter table public.vehicles alter column color drop not null;
