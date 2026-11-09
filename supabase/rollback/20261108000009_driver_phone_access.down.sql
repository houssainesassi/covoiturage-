-- Reverts migration 9. Intentionally changes nothing.
-- Migration 9 only removes get_driver_phones(), which production never had.
-- Do not recreate that function: it would make driver numbers readable in bulk.
select 'migration 9 has nothing to revert' as result;
