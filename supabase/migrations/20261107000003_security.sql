-- =============================================================================
-- Migration 3: Row Level Security, table/column privileges, function privileges.
-- Principle: deny by default. Clients only get exactly the columns/rows they
-- need; every multi-row or money/seat operation goes through functions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Reset Supabase's permissive default grants on our tables.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Policy helpers (SECURITY DEFINER so policies on trips/bookings do not
-- recurse into each other's RLS).
create or replace function public.is_trip_driver(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.trips where id = p_trip_id and driver_id = auth.uid());
$$;

create or replace function public.has_booking_on_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.bookings where trip_id = p_trip_id and passenger_id = auth.uid());
$$;

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations
    where id = p_conversation_id and auth.uid() in (driver_id, passenger_id)
  );
$$;

-- Enable RLS on every table.
alter table public.governorates   enable row level security;
alter table public.locations      enable row level security;
alter table public.profiles       enable row level security;
alter table public.profile_private enable row level security;
alter table public.vehicles       enable row level security;
alter table public.trips          enable row level security;
alter table public.bookings       enable row level security;
alter table public.conversations  enable row level security;
alter table public.messages       enable row level security;
alter table public.notifications  enable row level security;
alter table public.reviews        enable row level security;
alter table public.reports        enable row level security;
alter table public.admin_actions  enable row level security;

-- ---------------------------------------------------------------------------
-- Reference data: public read-only
-- ---------------------------------------------------------------------------
grant select on public.governorates, public.locations to anon, authenticated;
create policy governorates_read on public.governorates for select using (true);
create policy locations_read on public.locations for select using (true);

-- ---------------------------------------------------------------------------
-- profiles: public read; owners may only edit descriptive columns.
-- role / status / ratings / counters are changed exclusively by functions.
-- ---------------------------------------------------------------------------
grant select on public.profiles to anon, authenticated;
grant update (full_name, avatar_path, bio, city_id, preferred_locale,
              pref_smoking, pref_pets, pref_music, pref_chatty)
  on public.profiles to authenticated;

create policy profiles_read on public.profiles for select using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- profile_private: owner (and admins) only.
-- ---------------------------------------------------------------------------
grant select on public.profile_private to authenticated;
grant insert (id, phone, date_of_birth) on public.profile_private to authenticated;
grant update (phone, date_of_birth) on public.profile_private to authenticated;

create policy profile_private_read on public.profile_private for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profile_private_insert on public.profile_private for insert to authenticated
  with check (id = (select auth.uid()));
create policy profile_private_update on public.profile_private for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- vehicles: public may read non-sensitive columns (plate_number excluded —
-- it is revealed only to confirmed passengers through get_trip_contacts()).
-- ---------------------------------------------------------------------------
grant select (id, owner_id, type, brand, model, color, year, seats, photo_paths, is_active, created_at, updated_at)
  on public.vehicles to anon, authenticated;
grant insert (owner_id, type, brand, model, color, year, seats, plate_number, photo_paths)
  on public.vehicles to authenticated;
grant update (type, brand, model, color, year, seats, plate_number, photo_paths, is_active)
  on public.vehicles to authenticated;
grant delete on public.vehicles to authenticated;

create policy vehicles_read on public.vehicles for select using (true);
create policy vehicles_insert on public.vehicles for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_active_user()));
create policy vehicles_update on public.vehicles for update to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_active_user()))
  with check (owner_id = (select auth.uid()));
create policy vehicles_delete on public.vehicles for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- trips: public read of non-cancelled trips; drivers insert/update their own.
-- Status and seat counters are never client-writable.
-- ---------------------------------------------------------------------------
grant select on public.trips to anon, authenticated;
grant insert (driver_id, vehicle_id, origin_id, destination_id, origin_address, destination_address,
              origin_lat, origin_lng, destination_lat, destination_lng, departure_at,
              seats_total, price_per_seat, distance_km, duration_min, auto_accept, luggage_size, description)
  on public.trips to authenticated;
grant update (vehicle_id, origin_id, destination_id, origin_address, destination_address,
              origin_lat, origin_lng, destination_lat, destination_lng, departure_at,
              seats_total, price_per_seat, distance_km, duration_min, auto_accept, luggage_size, description)
  on public.trips to authenticated;

create policy trips_read on public.trips for select
  using (
    status <> 'cancelled'
    or driver_id = (select auth.uid())
    or (select public.is_admin())
    or public.has_booking_on_trip(id)
  );
create policy trips_insert on public.trips for insert to authenticated
  with check (driver_id = (select auth.uid()) and (select public.is_active_user()));
create policy trips_update on public.trips for update to authenticated
  using (driver_id = (select auth.uid()) and (select public.is_active_user()))
  with check (driver_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- bookings: visible to the passenger, the trip's driver and admins.
-- All writes go through request_booking / respond_booking / cancel_booking.
-- ---------------------------------------------------------------------------
grant select on public.bookings to authenticated;
create policy bookings_read on public.bookings for select to authenticated
  using (
    passenger_id = (select auth.uid())
    or public.is_trip_driver(trip_id)
    or (select public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- conversations & messages: participants only.
-- ---------------------------------------------------------------------------
grant select on public.conversations to authenticated;
create policy conversations_read on public.conversations for select to authenticated
  using ((select auth.uid()) in (driver_id, passenger_id));

grant select on public.messages to authenticated;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;
create policy messages_read on public.messages for select to authenticated
  using (not is_hidden and public.is_conversation_participant(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select public.is_active_user())
    and public.is_conversation_participant(conversation_id)
  );

-- ---------------------------------------------------------------------------
-- notifications: owner can read, mark read and delete.
-- ---------------------------------------------------------------------------
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- reviews: public read unless hidden by moderation; written via submit_review().
-- ---------------------------------------------------------------------------
grant select on public.reviews to anon, authenticated;
create policy reviews_read on public.reviews for select
  using (
    not is_hidden
    or reviewer_id = (select auth.uid())
    or reviewee_id = (select auth.uid())
    or (select public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- reports: users file reports and see their own; admins see all.
-- ---------------------------------------------------------------------------
grant select on public.reports to authenticated;
grant insert (reporter_id, reported_user_id, trip_id, message_id, review_id, reason, details)
  on public.reports to authenticated;
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_admin()));
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and (select public.is_active_user()));

-- ---------------------------------------------------------------------------
-- admin_actions: admins read; written only by admin functions.
-- ---------------------------------------------------------------------------
grant select on public.admin_actions to authenticated;
create policy admin_actions_read on public.admin_actions for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
-- Used inside RLS policies, so callers must be able to execute them.
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_active_user() to anon, authenticated;
grant execute on function public.is_trip_driver(uuid) to anon, authenticated;
grant execute on function public.has_booking_on_trip(uuid) to anon, authenticated;
grant execute on function public.is_conversation_participant(uuid) to anon, authenticated;

-- Public read-only API
grant execute on function public.search_trips(uuid, uuid, date, integer, numeric, time, time, numeric, text, integer, integer, double precision) to anon, authenticated;
grant execute on function public.get_trip_passengers_public(uuid) to anon, authenticated;
grant execute on function public.distance_km(double precision, double precision, double precision, double precision) to anon, authenticated;

-- Signed-in user API
grant execute on function public.request_booking(uuid, integer, text) to authenticated;
grant execute on function public.respond_booking(uuid, boolean) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
grant execute on function public.cancel_trip(uuid, text) to authenticated;
grant execute on function public.complete_trip(uuid) to authenticated;
grant execute on function public.start_conversation(uuid, uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.unread_message_count() to authenticated;
grant execute on function public.conversation_unread_counts() to authenticated;
grant execute on function public.get_trip_contacts(uuid) to authenticated;
grant execute on function public.get_my_vehicles() to authenticated;
grant execute on function public.submit_review(uuid, uuid, integer, text) to authenticated;
grant execute on function public.pending_reviews() to authenticated;
grant execute on function public.driver_stats() to authenticated;

-- Admin API (each function also checks is_admin() internally)
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_list_users(text, public.account_status, public.user_role, integer, integer) to authenticated;
grant execute on function public.admin_set_user_status(uuid, public.account_status, text) to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.user_role) to authenticated;
grant execute on function public.admin_update_report(uuid, public.report_status, text) to authenticated;
grant execute on function public.admin_set_review_hidden(uuid, boolean) to authenticated;
grant execute on function public.admin_set_message_hidden(uuid, boolean) to authenticated;
grant execute on function public.admin_get_message(uuid) to authenticated;

-- Scheduled jobs: service role only (pg_cron runs as postgres).
grant execute on function public.complete_past_trips() to service_role;
grant execute on function public.send_trip_reminders() to service_role;

-- Internal helpers (notify_user, _cancel_trip, _complete_trip, trip_summary,
-- display_name, require_*, refresh_user_rating, trigger functions) stay
-- non-executable for API roles.
