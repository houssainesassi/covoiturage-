-- =============================================================================
-- Migration 6: scheduled maintenance jobs (pg_cron).
--   * every 15 min: "trip approaching" reminders (departures within 24 h)
--   * every 30 min: auto-complete trips 12 h after departure
-- If pg_cron is unavailable this migration is a no-op; the application also
-- exposes /api/cron (protected by CRON_SECRET) that runs the same functions.
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;

    perform cron.unschedule(jobid) from cron.job
    where jobname in ('wasalni-trip-reminders', 'wasalni-complete-trips');

    perform cron.schedule('wasalni-trip-reminders', '*/15 * * * *', 'select public.send_trip_reminders()');
    perform cron.schedule('wasalni-complete-trips', '*/30 * * * *', 'select public.complete_past_trips()');
  else
    raise notice 'pg_cron not available: use the /api/cron endpoint instead';
  end if;
end;
$$;
