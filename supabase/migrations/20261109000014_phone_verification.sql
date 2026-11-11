-- =============================================================================
-- Migration 14: intentionally empty (superseded, 2026-11-11).
--
-- It used to require an SMS-verified phone to publish or book. Phone numbers are
-- now a plain profile field and are never verified by SMS: the email code is the
-- only verification (see migration 15). The version number is kept so the
-- migration history stays in order; this file changes nothing.
--
-- Rollback: supabase/rollback/20261109000014_phone_verification.down.sql (no-op)
-- =============================================================================

select 1;
