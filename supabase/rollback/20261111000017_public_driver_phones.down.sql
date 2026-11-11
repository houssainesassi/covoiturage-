-- =============================================================================
-- Rollback of migration 17. Returns to the migration 9 rule: a driver's number
-- is shown only to passengers with a confirmed booking (get_trip_contacts()).
--
-- REMOVED (everything migration 17 added):
--   * get_public_driver_phones(uuid[])        - the members-only lookup
--   * set_my_phone_public(boolean)            - the consent switch
--   * trigger + function profile_private_reset_phone_consent
--   * table phone_reveals (rate-limit log; its rows are deleted with it)
--   * columns profile_private.phone_public, profile_private.phone_public_at
--     (every driver's consent is lost; re-applying 17 starts everyone at "off")
--
-- PERMISSIONS RESTORED: none are needed. Before migration 17 no role had any
-- privilege on the objects removed above, so dropping them restores that state.
--
-- HARDENING INTENTIONALLY KEPT (not undone, because undoing it only weakens):
--   * admin_list_users(): EXECUTE stays revoked from PUBLIC and anon. Guests
--     never had a legitimate use; admins (authenticated) keep EXECUTE.
--   * profile_private privileges stay exactly as migration 3 defined them:
--     authenticated = SELECT (RLS: own row / admins), INSERT (id, phone,
--     date_of_birth), UPDATE (phone, date_of_birth); anon = nothing. Migration
--     17 only re-asserted these; any hand-made broader grant stays removed.
-- =============================================================================

drop function if exists public.get_public_driver_phones(uuid[]);
drop function if exists public.set_my_phone_public(boolean);
drop trigger if exists profile_private_reset_phone_consent on public.profile_private;
drop function if exists public.profile_private_reset_phone_consent();
drop table if exists public.phone_reveals;
alter table public.profile_private
  drop column if exists phone_public_at,
  drop column if exists phone_public;
