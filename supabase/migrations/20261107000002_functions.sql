-- =============================================================================
-- Migration 2: business logic.
-- Every state-changing operation that involves seats, money or another user
-- goes through a SECURITY DEFINER function that validates the caller and locks
-- the rows it touches. Errors are raised with a stable machine-readable code
-- as the message (errcode P0001) so the application can translate them.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  );
$$;

-- Raises unless the caller is signed in and not suspended. Returns the user id.
create or replace function public.require_active_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and status = 'active') then
    raise exception 'account_suspended' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;

-- Compact, locale-independent trip description stored in notification payloads.
create or replace function public.trip_summary(p_trip_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'trip_id', t.id,
    'departure_at', t.departure_at,
    'origin', jsonb_build_object('fr', o.name_fr, 'ar', o.name_ar, 'en', o.name_en),
    'destination', jsonb_build_object('fr', d.name_fr, 'ar', d.name_ar, 'en', d.name_en)
  )
  from public.trips t
  join public.locations o on o.id = t.origin_id
  join public.locations d on d.id = t.destination_id
  where t.id = p_trip_id;
$$;

create or replace function public.notify_user(
  p_user_id uuid,
  p_type public.notification_type,
  p_data jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, data)
  values (p_user_id, p_type, coalesce(p_data, '{}'::jsonb));
$$;

create or replace function public.display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(full_name, ''), '—') from public.profiles where id = p_user_id;
$$;

-- ---------------------------------------------------------------------------
-- Trip validation triggers
-- ---------------------------------------------------------------------------
create or replace function public.trips_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles%rowtype;
  v_recent  integer;
begin
  -- Server-controlled fields: never trust what the client sent.
  new.status := 'scheduled';
  new.seats_available := new.seats_total;
  new.cancelled_at := null;
  new.completed_at := null;
  new.cancellation_reason := null;
  new.reminder_sent_at := null;

  if not exists (select 1 from public.profiles where id = new.driver_id and status = 'active') then
    raise exception 'account_suspended' using errcode = 'P0001';
  end if;

  if new.departure_at <= now() + interval '15 minutes' then
    raise exception 'departure_in_past' using errcode = 'P0001';
  end if;
  if new.departure_at > now() + interval '6 months' then
    raise exception 'departure_too_far' using errcode = 'P0001';
  end if;

  if new.vehicle_id is not null then
    select * into v_vehicle from public.vehicles where id = new.vehicle_id;
    if not found or v_vehicle.owner_id <> new.driver_id or not v_vehicle.is_active then
      raise exception 'invalid_vehicle' using errcode = 'P0001';
    end if;
    if new.seats_total > v_vehicle.seats then
      raise exception 'seats_exceed_vehicle' using errcode = 'P0001';
    end if;
  end if;

  -- Rate limit: 15 published trips per rolling 24 hours.
  select count(*) into v_recent from public.trips
  where driver_id = new.driver_id and created_at > now() - interval '24 hours';
  if v_recent >= 15 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
create trigger trips_validate_insert before insert on public.trips
  for each row execute function public.trips_before_insert();

create or replace function public.trips_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edited  boolean;
  v_booked  integer;
  v_vehicle public.vehicles%rowtype;
begin
  if new.driver_id <> old.driver_id then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  v_edited := (new.origin_id, new.destination_id, new.origin_address, new.destination_address,
               new.origin_lat, new.origin_lng, new.destination_lat, new.destination_lng,
               new.departure_at, new.seats_total, new.price_per_seat, new.vehicle_id,
               new.auto_accept, new.luggage_size, new.description, new.distance_km, new.duration_min)
          is distinct from
              (old.origin_id, old.destination_id, old.origin_address, old.destination_address,
               old.origin_lat, old.origin_lng, old.destination_lat, old.destination_lng,
               old.departure_at, old.seats_total, old.price_per_seat, old.vehicle_id,
               old.auto_accept, old.luggage_size, old.description, old.distance_km, old.duration_min);

  if v_edited then
    if old.status <> 'scheduled' or old.departure_at <= now() then
      raise exception 'trip_not_editable' using errcode = 'P0001';
    end if;
    if new.departure_at <= now() + interval '15 minutes' then
      raise exception 'departure_in_past' using errcode = 'P0001';
    end if;
    if new.departure_at > now() + interval '6 months' then
      raise exception 'departure_too_far' using errcode = 'P0001';
    end if;

    v_booked := old.seats_total - old.seats_available;

    -- Cities cannot change once passengers hold seats.
    if v_booked > 0 and (new.origin_id <> old.origin_id or new.destination_id <> old.destination_id) then
      raise exception 'route_locked' using errcode = 'P0001';
    end if;

    if new.seats_total <> old.seats_total then
      if new.seats_total < v_booked then
        raise exception 'seats_below_booked' using errcode = 'P0001';
      end if;
      new.seats_available := new.seats_total - v_booked;
    end if;

    if new.vehicle_id is not null then
      select * into v_vehicle from public.vehicles where id = new.vehicle_id;
      if not found or v_vehicle.owner_id <> new.driver_id
         or (not v_vehicle.is_active and new.vehicle_id is distinct from old.vehicle_id) then
        raise exception 'invalid_vehicle' using errcode = 'P0001';
      end if;
      if new.seats_total > v_vehicle.seats then
        raise exception 'seats_exceed_vehicle' using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$$;
create trigger trips_validate_update before update on public.trips
  for each row execute function public.trips_before_update();

-- Tell passengers when the driver changes something important.
create or replace function public.trips_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_summary jsonb;
begin
  if new.status = 'scheduled' and old.status = 'scheduled' and
     (new.departure_at, new.origin_address, new.destination_address, new.price_per_seat)
       is distinct from
     (old.departure_at, old.origin_address, old.destination_address, old.price_per_seat) then
    v_summary := public.trip_summary(new.id);
    for r in
      select passenger_id from public.bookings
      where trip_id = new.id and status in ('pending', 'confirmed')
    loop
      perform public.notify_user(r.passenger_id, 'trip_updated',
        v_summary || jsonb_build_object(
          'time_changed', new.departure_at is distinct from old.departure_at,
          'old_departure_at', old.departure_at));
    end loop;
  end if;
  return null;
end;
$$;
create trigger trips_notify_update after update on public.trips
  for each row execute function public.trips_after_update();

-- ---------------------------------------------------------------------------
-- Booking lifecycle
-- ---------------------------------------------------------------------------

-- Atomically reserves seats. The trip row is locked FOR UPDATE, so concurrent
-- requests for the same trip are serialised and can never overbook.
create or replace function public.request_booking(
  p_trip_id uuid,
  p_seats integer,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := public.require_active_user();
  v_trip    public.trips%rowtype;
  v_status  public.booking_status;
  v_id      uuid;
  v_recent  integer;
  v_summary jsonb;
begin
  if p_seats is null or p_seats < 1 or p_seats > 8 then
    raise exception 'invalid_seats' using errcode = 'P0001';
  end if;
  if p_message is not null and char_length(p_message) > 500 then
    raise exception 'message_too_long' using errcode = 'P0001';
  end if;

  select count(*) into v_recent from public.bookings
  where passenger_id = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then
    raise exception 'trip_not_found' using errcode = 'P0001';
  end if;
  if v_trip.driver_id = v_uid then
    raise exception 'cannot_book_own_trip' using errcode = 'P0001';
  end if;
  if v_trip.status <> 'scheduled' or v_trip.departure_at <= now() then
    raise exception 'trip_not_bookable' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = v_trip.driver_id and status = 'active') then
    raise exception 'trip_not_bookable' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.bookings
    where trip_id = p_trip_id and passenger_id = v_uid and status in ('pending', 'confirmed')
  ) then
    raise exception 'duplicate_booking' using errcode = 'P0001';
  end if;
  if v_trip.seats_available < p_seats then
    raise exception 'not_enough_seats' using errcode = 'P0001';
  end if;

  v_status := case when v_trip.auto_accept then 'confirmed'::public.booking_status
                   else 'pending'::public.booking_status end;

  insert into public.bookings (trip_id, passenger_id, seats, price_per_seat, status, message, responded_at)
  values (p_trip_id, v_uid, p_seats, v_trip.price_per_seat, v_status,
          nullif(trim(p_message), ''),
          case when v_status = 'confirmed' then now() end)
  returning id into v_id;

  update public.trips set seats_available = seats_available - p_seats where id = p_trip_id;

  insert into public.conversations (trip_id, driver_id, passenger_id)
  values (p_trip_id, v_trip.driver_id, v_uid)
  on conflict (trip_id, passenger_id) do nothing;

  v_summary := public.trip_summary(p_trip_id) || jsonb_build_object(
    'booking_id', v_id, 'seats', p_seats,
    'actor_id', v_uid, 'actor_name', public.display_name(v_uid),
    'auto_accepted', v_status = 'confirmed');

  perform public.notify_user(v_trip.driver_id, 'booking_request', v_summary);
  if v_status = 'confirmed' then
    perform public.notify_user(v_uid, 'booking_confirmed',
      v_summary || jsonb_build_object('actor_id', v_trip.driver_id,
                                      'actor_name', public.display_name(v_trip.driver_id)));
  end if;

  return v_id;
end;
$$;

-- Driver accepts or rejects a pending request.
create or replace function public.respond_booking(p_booking_id uuid, p_accept boolean)
returns public.booking_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := public.require_active_user();
  v_trip_id  uuid;
  v_trip     public.trips%rowtype;
  v_booking  public.bookings%rowtype;
  v_new      public.booking_status;
begin
  select trip_id into v_trip_id from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;

  -- Lock order: trip, then booking (same order as request_booking).
  select * into v_trip from public.trips where id = v_trip_id for update;
  select * into v_booking from public.bookings where id = p_booking_id for update;

  if v_trip.driver_id <> v_uid then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_booking.status <> 'pending' then
    raise exception 'booking_not_pending' using errcode = 'P0001';
  end if;
  if p_accept and (v_trip.status <> 'scheduled' or v_trip.departure_at <= now()) then
    raise exception 'trip_not_bookable' using errcode = 'P0001';
  end if;

  if p_accept then
    v_new := 'confirmed';
    update public.bookings set status = v_new, responded_at = now() where id = p_booking_id;
  else
    v_new := 'rejected';
    update public.bookings set status = v_new, responded_at = now() where id = p_booking_id;
    if v_trip.status = 'scheduled' then
      update public.trips set seats_available = seats_available + v_booking.seats where id = v_trip.id;
    end if;
  end if;

  perform public.notify_user(
    v_booking.passenger_id,
    case when p_accept then 'booking_confirmed'::public.notification_type
         else 'booking_rejected'::public.notification_type end,
    public.trip_summary(v_trip.id) || jsonb_build_object(
      'booking_id', p_booking_id, 'seats', v_booking.seats,
      'actor_id', v_uid, 'actor_name', public.display_name(v_uid)));

  return v_new;
end;
$$;

-- Passenger (or the trip's driver, or an admin) cancels an active booking.
-- Platform rule: bookings can be cancelled until the departure time.
create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := public.require_active_user();
  v_admin    boolean := public.is_admin();
  v_trip_id  uuid;
  v_trip     public.trips%rowtype;
  v_booking  public.bookings%rowtype;
  v_notify   uuid;
begin
  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'message_too_long' using errcode = 'P0001';
  end if;

  select trip_id into v_trip_id from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;

  select * into v_trip from public.trips where id = v_trip_id for update;
  select * into v_booking from public.bookings where id = p_booking_id for update;

  if v_booking.passenger_id <> v_uid and v_trip.driver_id <> v_uid and not v_admin then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_booking.status not in ('pending', 'confirmed') then
    raise exception 'booking_not_active' using errcode = 'P0001';
  end if;
  if v_trip.departure_at <= now() and not v_admin then
    raise exception 'cancellation_window_closed' using errcode = 'P0001';
  end if;

  update public.bookings
  set status = 'cancelled', cancelled_by = v_uid, cancelled_at = now(),
      cancellation_reason = nullif(trim(p_reason), '')
  where id = p_booking_id;

  if v_trip.status = 'scheduled' then
    update public.trips set seats_available = seats_available + v_booking.seats where id = v_trip.id;
  end if;

  -- Notify the other party (both when an admin cancels).
  if v_uid = v_booking.passenger_id then
    v_notify := v_trip.driver_id;
  elsif v_uid = v_trip.driver_id then
    v_notify := v_booking.passenger_id;
  end if;

  if v_notify is not null then
    perform public.notify_user(v_notify, 'booking_cancelled',
      public.trip_summary(v_trip.id) || jsonb_build_object(
        'booking_id', p_booking_id, 'seats', v_booking.seats,
        'actor_id', v_uid, 'actor_name', public.display_name(v_uid),
        'reason', nullif(trim(p_reason), '')));
  else
    perform public.notify_user(v_trip.driver_id, 'booking_cancelled',
      public.trip_summary(v_trip.id) || jsonb_build_object('booking_id', p_booking_id, 'seats', v_booking.seats, 'by_admin', true));
    perform public.notify_user(v_booking.passenger_id, 'booking_cancelled',
      public.trip_summary(v_trip.id) || jsonb_build_object('booking_id', p_booking_id, 'seats', v_booking.seats, 'by_admin', true));
  end if;

  if v_admin and v_uid not in (v_booking.passenger_id, v_trip.driver_id) then
    insert into public.admin_actions (admin_id, action, target_type, target_id, details)
    values (v_uid, 'cancel_booking', 'booking', p_booking_id, jsonb_build_object('reason', p_reason));
  end if;
end;
$$;

-- Internal: cancels a trip and every active booking on it. Caller must hold no lock.
create or replace function public._cancel_trip(p_trip_id uuid, p_actor uuid, p_reason text, p_by_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip    public.trips%rowtype;
  r         record;
  v_summary jsonb;
begin
  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then
    raise exception 'trip_not_found' using errcode = 'P0001';
  end if;
  if v_trip.status <> 'scheduled' then
    raise exception 'trip_not_active' using errcode = 'P0001';
  end if;

  v_summary := public.trip_summary(p_trip_id) || jsonb_build_object(
    'reason', nullif(trim(p_reason), ''), 'by_admin', p_by_admin,
    'actor_id', p_actor, 'actor_name', public.display_name(p_actor));

  for r in
    select id, passenger_id from public.bookings
    where trip_id = p_trip_id and status in ('pending', 'confirmed')
    for update
  loop
    update public.bookings
    set status = 'cancelled', cancelled_by = p_actor, cancelled_at = now(),
        cancellation_reason = nullif(trim(p_reason), '')
    where id = r.id;
    perform public.notify_user(r.passenger_id, 'trip_cancelled', v_summary || jsonb_build_object('booking_id', r.id));
  end loop;

  update public.trips
  set status = 'cancelled', cancelled_at = now(), seats_available = seats_total,
      cancellation_reason = nullif(trim(p_reason), '')
  where id = p_trip_id;

  if p_by_admin then
    perform public.notify_user(v_trip.driver_id, 'trip_cancelled', v_summary);
  end if;
end;
$$;

create or replace function public.cancel_trip(p_trip_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := public.require_active_user();
  v_admin  boolean := public.is_admin();
  v_trip   public.trips%rowtype;
begin
  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'message_too_long' using errcode = 'P0001';
  end if;
  select * into v_trip from public.trips where id = p_trip_id;
  if not found then
    raise exception 'trip_not_found' using errcode = 'P0001';
  end if;
  if v_trip.driver_id <> v_uid and not v_admin then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_trip.departure_at <= now() and not v_admin then
    raise exception 'trip_not_editable' using errcode = 'P0001';
  end if;

  perform public._cancel_trip(p_trip_id, v_uid, p_reason, v_trip.driver_id <> v_uid);

  if v_trip.driver_id <> v_uid then
    insert into public.admin_actions (admin_id, action, target_type, target_id, details)
    values (v_uid, 'cancel_trip', 'trip', p_trip_id, jsonb_build_object('reason', p_reason));
  end if;
end;
$$;

-- Internal: marks a departed trip as completed.
create or replace function public._complete_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip      public.trips%rowtype;
  v_summary   jsonb;
  r           record;
  v_completed integer := 0;
begin
  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found or v_trip.status <> 'scheduled' then
    return;
  end if;

  v_summary := public.trip_summary(p_trip_id) || jsonb_build_object(
    'actor_id', v_trip.driver_id, 'actor_name', public.display_name(v_trip.driver_id));

  -- Requests the driver never answered expire.
  update public.bookings set status = 'rejected', responded_at = now()
  where trip_id = p_trip_id and status = 'pending';

  for r in
    select id, passenger_id from public.bookings
    where trip_id = p_trip_id and status = 'confirmed'
    for update
  loop
    update public.bookings set status = 'completed', completed_at = now() where id = r.id;
    update public.profiles set trips_taken = trips_taken + 1 where id = r.passenger_id;
    perform public.notify_user(r.passenger_id, 'trip_completed', v_summary || jsonb_build_object('booking_id', r.id));
    v_completed := v_completed + 1;
  end loop;

  update public.trips
  set status = 'completed', completed_at = now(),
      seats_available = least(seats_total, seats_available + coalesce((
        select sum(seats) from public.bookings where trip_id = p_trip_id and status = 'rejected' and responded_at >= now()
      ), 0))
  where id = p_trip_id;

  if v_completed > 0 then
    update public.profiles set trips_driven = trips_driven + 1 where id = v_trip.driver_id;
    perform public.notify_user(v_trip.driver_id, 'trip_completed',
      public.trip_summary(p_trip_id) || jsonb_build_object('passengers', v_completed));
  end if;
end;
$$;

-- Driver marks their trip as done once it has departed.
create or replace function public.complete_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := public.require_active_user();
  v_trip public.trips%rowtype;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  if not found then
    raise exception 'trip_not_found' using errcode = 'P0001';
  end if;
  if v_trip.driver_id <> v_uid and not public.is_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_trip.status <> 'scheduled' then
    raise exception 'trip_not_active' using errcode = 'P0001';
  end if;
  if v_trip.departure_at > now() then
    raise exception 'trip_not_departed' using errcode = 'P0001';
  end if;
  perform public._complete_trip(p_trip_id);
end;
$$;

-- Scheduled job: auto-complete trips 12 hours after departure.
create or replace function public.complete_past_trips()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id from public.trips
    where status = 'scheduled' and departure_at < now() - interval '12 hours'
    order by departure_at
    limit 500
  loop
    perform public._complete_trip(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Scheduled job: "your trip is approaching" (within 24 hours).
create or replace function public.send_trip_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  b record;
  v_summary jsonb;
  n integer := 0;
begin
  for r in
    select id, driver_id from public.trips
    where status = 'scheduled'
      and reminder_sent_at is null
      and departure_at > now()
      and departure_at <= now() + interval '24 hours'
    for update skip locked
  loop
    v_summary := public.trip_summary(r.id);
    if exists (select 1 from public.bookings where trip_id = r.id and status = 'confirmed') then
      perform public.notify_user(r.driver_id, 'trip_reminder', v_summary || jsonb_build_object('role', 'driver'));
      for b in select passenger_id from public.bookings where trip_id = r.id and status = 'confirmed' loop
        perform public.notify_user(b.passenger_id, 'trip_reminder', v_summary || jsonb_build_object('role', 'passenger'));
      end loop;
    end if;
    update public.trips set reminder_sent_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------

-- Opens (or returns) the conversation between a trip's driver and a passenger.
-- Passengers may contact the driver of any upcoming trip; drivers may only
-- contact passengers who have booked their trip.
create or replace function public.start_conversation(p_trip_id uuid, p_passenger_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := public.require_active_user();
  v_trip      public.trips%rowtype;
  v_passenger uuid;
  v_id        uuid;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  if not found then
    raise exception 'trip_not_found' using errcode = 'P0001';
  end if;

  if v_uid = v_trip.driver_id then
    if p_passenger_id is null or not exists (
      select 1 from public.bookings where trip_id = p_trip_id and passenger_id = p_passenger_id
    ) then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
    v_passenger := p_passenger_id;
  else
    v_passenger := v_uid;
    if v_trip.status <> 'scheduled' and not exists (
      select 1 from public.bookings where trip_id = p_trip_id and passenger_id = v_uid
    ) then
      raise exception 'trip_not_active' using errcode = 'P0001';
    end if;
  end if;

  insert into public.conversations (trip_id, driver_id, passenger_id)
  values (p_trip_id, v_trip.driver_id, v_passenger)
  on conflict (trip_id, passenger_id) do nothing;

  select id into v_id from public.conversations where trip_id = p_trip_id and passenger_id = v_passenger;
  return v_id;
end;
$$;

create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent integer;
begin
  new.body := trim(new.body);
  new.read_at := null;
  new.is_hidden := false;
  new.created_at := now();

  select count(*) into v_recent from public.messages
  where sender_id = new.sender_id and created_at > now() - interval '1 minute';
  if v_recent >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger messages_validate_insert before insert on public.messages
  for each row execute function public.messages_before_insert();

create or replace function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv      public.conversations%rowtype;
  v_recipient uuid;
begin
  select * into v_conv from public.conversations where id = new.conversation_id;
  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = left(new.body, 140),
      last_sender_id = new.sender_id
  where id = new.conversation_id;

  v_recipient := case when new.sender_id = v_conv.driver_id then v_conv.passenger_id else v_conv.driver_id end;

  -- One unread "new message" notification per conversation is enough.
  if not exists (
    select 1 from public.notifications
    where user_id = v_recipient and type = 'new_message' and read_at is null
      and data ->> 'conversation_id' = new.conversation_id::text
  ) then
    perform public.notify_user(v_recipient, 'new_message',
      public.trip_summary(v_conv.trip_id) || jsonb_build_object(
        'conversation_id', new.conversation_id,
        'actor_id', new.sender_id, 'actor_name', public.display_name(new.sender_id),
        'preview', left(new.body, 140)));
  end if;
  return null;
end;
$$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.messages_after_insert();

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.conversations
    where id = p_conversation_id and v_uid in (driver_id, passenger_id)
  ) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  update public.messages set read_at = now()
  where conversation_id = p_conversation_id and sender_id <> v_uid and read_at is null;

  update public.notifications set read_at = now()
  where user_id = v_uid and type = 'new_message' and read_at is null
    and data ->> 'conversation_id' = p_conversation_id::text;
end;
$$;

create or replace function public.unread_message_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where auth.uid() in (c.driver_id, c.passenger_id)
    and m.sender_id <> auth.uid()
    and m.read_at is null
    and not m.is_hidden;
$$;

-- Unread counts per conversation for the inbox.
create or replace function public.conversation_unread_counts()
returns table (conversation_id uuid, unread integer)
language sql
stable
security definer
set search_path = ''
as $$
  select m.conversation_id, count(*)::integer
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where auth.uid() in (c.driver_id, c.passenger_id)
    and m.sender_id <> auth.uid()
    and m.read_at is null
    and not m.is_hidden
  group by m.conversation_id;
$$;

-- ---------------------------------------------------------------------------
-- Contact details revealed only between confirmed trip participants
-- ---------------------------------------------------------------------------
create or replace function public.get_trip_contacts(p_trip_id uuid)
returns table (user_id uuid, full_name text, phone text, role text, plate_number text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_trip public.trips%rowtype;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  if not found or v_uid is null then
    return;
  end if;

  if v_uid = v_trip.driver_id or public.is_admin() then
    return query
      select b.passenger_id, p.full_name, pp.phone, 'passenger'::text, null::text
      from public.bookings b
      join public.profiles p on p.id = b.passenger_id
      left join public.profile_private pp on pp.id = b.passenger_id
      where b.trip_id = p_trip_id and b.status in ('confirmed', 'completed');
  elsif exists (
    select 1 from public.bookings
    where trip_id = p_trip_id and passenger_id = v_uid and status in ('confirmed', 'completed')
  ) then
    return query
      select v_trip.driver_id, p.full_name, pp.phone, 'driver'::text, v.plate_number
      from public.profiles p
      left join public.profile_private pp on pp.id = p.id
      left join public.vehicles v on v.id = v_trip.vehicle_id
      where p.id = v_trip.driver_id;
  end if;
end;
$$;

-- Public list of confirmed co-travellers on a trip (name/avatar only).
create or replace function public.get_trip_passengers_public(p_trip_id uuid)
returns table (user_id uuid, full_name text, avatar_path text, rating_avg numeric, seats smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.avatar_path, p.rating_avg, b.seats
  from public.bookings b
  join public.profiles p on p.id = b.passenger_id
  where b.trip_id = p_trip_id and b.status in ('confirmed', 'completed')
  order by b.created_at;
$$;

-- The owner's vehicles including the (non-public) plate number.
create or replace function public.get_my_vehicles()
returns setof public.vehicles
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.vehicles where owner_id = auth.uid() order by is_active desc, created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
create or replace function public.submit_review(
  p_trip_id uuid,
  p_reviewee_id uuid,
  p_rating integer,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := public.require_active_user();
  v_trip  public.trips%rowtype;
  v_role  text;
  v_id    uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating' using errcode = 'P0001';
  end if;
  if p_comment is not null and char_length(p_comment) > 1000 then
    raise exception 'message_too_long' using errcode = 'P0001';
  end if;

  select * into v_trip from public.trips where id = p_trip_id;
  if not found then
    raise exception 'trip_not_found' using errcode = 'P0001';
  end if;
  if v_trip.status <> 'completed' then
    raise exception 'trip_not_completed' using errcode = 'P0001';
  end if;
  if v_trip.completed_at < now() - interval '60 days' then
    raise exception 'review_window_closed' using errcode = 'P0001';
  end if;

  if v_uid = v_trip.driver_id then
    if not exists (
      select 1 from public.bookings
      where trip_id = p_trip_id and passenger_id = p_reviewee_id and status = 'completed'
    ) then
      raise exception 'not_participant' using errcode = 'P0001';
    end if;
    v_role := 'passenger';
  elsif exists (
    select 1 from public.bookings
    where trip_id = p_trip_id and passenger_id = v_uid and status = 'completed'
  ) then
    if p_reviewee_id <> v_trip.driver_id then
      raise exception 'not_participant' using errcode = 'P0001';
    end if;
    v_role := 'driver';
  else
    raise exception 'not_participant' using errcode = 'P0001';
  end if;

  begin
    insert into public.reviews (trip_id, reviewer_id, reviewee_id, reviewee_role, rating, comment)
    values (p_trip_id, v_uid, p_reviewee_id, v_role, p_rating, nullif(trim(p_comment), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'duplicate_review' using errcode = 'P0001';
  end;

  perform public.notify_user(p_reviewee_id, 'review_received',
    public.trip_summary(p_trip_id) || jsonb_build_object(
      'review_id', v_id, 'rating', p_rating,
      'actor_id', v_uid, 'actor_name', public.display_name(v_uid)));
  return v_id;
end;
$$;

create or replace function public.refresh_user_rating(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles p
  set rating_avg = coalesce(s.avg_rating, 0),
      rating_count = coalesce(s.cnt, 0)
  from (
    select round(avg(rating)::numeric, 2) as avg_rating, count(*)::integer as cnt
    from public.reviews where reviewee_id = p_user_id and not is_hidden
  ) s
  where p.id = p_user_id;
$$;

create or replace function public.reviews_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_user_rating(old.reviewee_id);
  else
    perform public.refresh_user_rating(new.reviewee_id);
  end if;
  return null;
end;
$$;
create trigger reviews_refresh_rating after insert or update or delete on public.reviews
  for each row execute function public.reviews_after_change();

-- Completed trips where the caller still owes a review.
create or replace function public.pending_reviews()
returns table (trip_id uuid, reviewee_id uuid, reviewee_name text, reviewee_avatar text,
               reviewee_role text, departure_at timestamptz, origin_id uuid, destination_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  -- as passenger: review the driver
  select t.id, t.driver_id, p.full_name, p.avatar_path, 'driver', t.departure_at, t.origin_id, t.destination_id
  from public.bookings b
  join public.trips t on t.id = b.trip_id
  join public.profiles p on p.id = t.driver_id
  where b.passenger_id = auth.uid() and b.status = 'completed'
    and t.completed_at > now() - interval '60 days'
    and not exists (select 1 from public.reviews r
                    where r.trip_id = t.id and r.reviewer_id = auth.uid() and r.reviewee_id = t.driver_id)
  union all
  -- as driver: review each passenger
  select t.id, b.passenger_id, p.full_name, p.avatar_path, 'passenger', t.departure_at, t.origin_id, t.destination_id
  from public.trips t
  join public.bookings b on b.trip_id = t.id and b.status = 'completed'
  join public.profiles p on p.id = b.passenger_id
  where t.driver_id = auth.uid()
    and t.completed_at > now() - interval '60 days'
    and not exists (select 1 from public.reviews r
                    where r.trip_id = t.id and r.reviewer_id = auth.uid() and r.reviewee_id = b.passenger_id)
  order by 6 desc;
$$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create or replace function public.reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent integer;
begin
  new.status := 'open';
  new.admin_note := null;
  new.resolved_by := null;
  new.resolved_at := null;
  select count(*) into v_recent from public.reports
  where reporter_id = new.reporter_id and created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger reports_validate_insert before insert on public.reports
  for each row execute function public.reports_before_insert();

-- ---------------------------------------------------------------------------
-- Search (public, read-only; exposes only public columns)
-- ---------------------------------------------------------------------------
create or replace function public.distance_km(lat1 double precision, lng1 double precision,
                                              lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

create or replace function public.search_trips(
  p_origin_id uuid default null,
  p_destination_id uuid default null,
  p_date date default null,
  p_seats integer default 1,
  p_max_price numeric default null,
  p_time_from time default null,
  p_time_to time default null,
  p_min_rating numeric default null,
  p_sort text default 'departure',
  p_limit integer default 12,
  p_offset integer default 0,
  p_radius_km double precision default 20
)
returns table (
  id uuid,
  departure_at timestamptz,
  price_per_seat numeric,
  seats_available smallint,
  seats_total smallint,
  origin_id uuid,
  destination_id uuid,
  origin_address text,
  destination_address text,
  auto_accept boolean,
  distance_km numeric,
  duration_min integer,
  driver_id uuid,
  driver_name text,
  driver_avatar_path text,
  driver_rating numeric,
  driver_rating_count integer,
  vehicle_type public.vehicle_type,
  vehicle_brand text,
  vehicle_model text,
  vehicle_color text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_o public.locations%rowtype;
  v_d public.locations%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_radius double precision := least(greatest(coalesce(p_radius_km, 20), 0), 100);
begin
  if p_origin_id is not null then
    select * into v_o from public.locations l where l.id = p_origin_id;
  end if;
  if p_destination_id is not null then
    select * into v_d from public.locations l where l.id = p_destination_id;
  end if;

  return query
  with matches as (
    select t.*, p.full_name, p.avatar_path, p.rating_avg, p.rating_count,
           v.type as v_type, v.brand, v.model, v.color,
           case when v_o.id is null then 0
                else public.distance_km(t.origin_lat, t.origin_lng, v_o.lat, v_o.lng) end as o_dist
    from public.trips t
    join public.profiles p on p.id = t.driver_id and p.status = 'active'
    left join public.vehicles v on v.id = t.vehicle_id
    where t.status = 'scheduled'
      and t.departure_at > now()
      and t.seats_available >= greatest(coalesce(p_seats, 1), 1)
      and (v_o.id is null or t.origin_id = v_o.id
           or public.distance_km(t.origin_lat, t.origin_lng, v_o.lat, v_o.lng) <= v_radius)
      and (v_d.id is null or t.destination_id = v_d.id
           or public.distance_km(t.destination_lat, t.destination_lng, v_d.lat, v_d.lng) <= v_radius)
      and (p_date is null or (t.departure_at at time zone 'Africa/Tunis')::date = p_date)
      and (p_max_price is null or t.price_per_seat <= p_max_price)
      and (p_time_from is null or (t.departure_at at time zone 'Africa/Tunis')::time >= p_time_from)
      and (p_time_to is null or (t.departure_at at time zone 'Africa/Tunis')::time <= p_time_to)
      and (p_min_rating is null or p.rating_avg >= p_min_rating)
  )
  select m.id, m.departure_at, m.price_per_seat, m.seats_available, m.seats_total,
         m.origin_id, m.destination_id, m.origin_address, m.destination_address,
         m.auto_accept, m.distance_km, m.duration_min,
         m.driver_id, m.full_name, m.avatar_path, m.rating_avg, m.rating_count,
         m.v_type, m.brand, m.model, m.color,
         count(*) over ()
  from matches m
  order by
    case when p_sort = 'price' then m.price_per_seat end asc nulls last,
    case when p_sort = 'rating' then m.rating_avg end desc nulls last,
    case when p_sort = 'nearest' then m.o_dist end asc nulls last,
    m.departure_at asc,
    m.id
  limit v_limit offset v_offset;
end;
$$;

-- ---------------------------------------------------------------------------
-- Driver statistics
-- ---------------------------------------------------------------------------
create or replace function public.driver_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select * from public.trips where driver_id = auth.uid()
  ), bk as (
    select b.*, t.departure_at, t.status as trip_status
    from public.bookings b join mine t on t.id = b.trip_id
  )
  select jsonb_build_object(
    'total_earnings', coalesce((select sum(total_price) from bk where status = 'completed'), 0),
    'expected_earnings', coalesce((select sum(total_price) from bk where status = 'confirmed' and trip_status = 'scheduled'), 0),
    'passengers_transported', coalesce((select sum(seats) from bk where status = 'completed'), 0),
    'trips_completed', (select count(*) from mine where status = 'completed'),
    'trips_upcoming', (select count(*) from mine where status = 'scheduled' and departure_at > now()),
    'trips_cancelled', (select count(*) from mine where status = 'cancelled'),
    'pending_requests', (select count(*) from bk where status = 'pending' and trip_status = 'scheduled'),
    'distance_km', coalesce((select sum(distance_km) from mine where status = 'completed'), 0),
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(m.month, 'YYYY-MM'), 'earnings', m.earnings, 'seats', m.seats) order by m.month)
      from (
        select gs.month,
               coalesce(sum(bk.total_price), 0) as earnings,
               coalesce(sum(bk.seats), 0) as seats
        from generate_series(
               date_trunc('month', now() at time zone 'Africa/Tunis') - interval '11 months',
               date_trunc('month', now() at time zone 'Africa/Tunis'),
               interval '1 month') as gs(month)
        left join bk on bk.status = 'completed'
                    and date_trunc('month', bk.departure_at at time zone 'Africa/Tunis') = gs.month
        group by gs.month
      ) m
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Administration (every function re-checks is_admin() server-side)
-- ---------------------------------------------------------------------------
create or replace function public.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  return auth.uid();
end;
$$;

create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_suspended', (select count(*) from public.profiles where status = 'suspended'),
    'users_new_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'drivers_total', (select count(distinct driver_id) from public.trips),
    'trips_total', (select count(*) from public.trips),
    'trips_scheduled', (select count(*) from public.trips where status = 'scheduled' and departure_at > now()),
    'trips_completed', (select count(*) from public.trips where status = 'completed'),
    'trips_cancelled', (select count(*) from public.trips where status = 'cancelled'),
    'bookings_total', (select count(*) from public.bookings),
    'bookings_pending', (select count(*) from public.bookings where status = 'pending'),
    'bookings_confirmed', (select count(*) from public.bookings where status = 'confirmed'),
    'bookings_completed', (select count(*) from public.bookings where status = 'completed'),
    'bookings_cancelled', (select count(*) from public.bookings where status in ('cancelled', 'rejected')),
    'volume_tnd', coalesce((select sum(total_price) from public.bookings where status = 'completed'), 0),
    'reports_open', (select count(*) from public.reports where status in ('open', 'in_review')),
    'messages_total', (select count(*) from public.messages),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day', to_char(d.day, 'YYYY-MM-DD'),
               'signups', (select count(*) from public.profiles p where (p.created_at at time zone 'Africa/Tunis')::date = d.day),
               'trips', (select count(*) from public.trips t where (t.created_at at time zone 'Africa/Tunis')::date = d.day),
               'bookings', (select count(*) from public.bookings b where (b.created_at at time zone 'Africa/Tunis')::date = d.day)
             ) order by d.day)
      from generate_series((now() at time zone 'Africa/Tunis')::date - 29,
                           (now() at time zone 'Africa/Tunis')::date, interval '1 day') as d(day)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_list_users(
  p_search text default null,
  p_status public.account_status default null,
  p_role public.user_role default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid, full_name text, email text, phone text, avatar_path text,
  role public.user_role, status public.account_status, suspended_reason text,
  rating_avg numeric, rating_count integer, trips_count bigint, bookings_count bigint,
  reports_count bigint, created_at timestamptz, last_sign_in_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select p.id, p.full_name, u.email::text, pp.phone, p.avatar_path, p.role, p.status, p.suspended_reason,
         p.rating_avg, p.rating_count,
         (select count(*) from public.trips t where t.driver_id = p.id),
         (select count(*) from public.bookings b where b.passenger_id = p.id),
         (select count(*) from public.reports r where r.reported_user_id = p.id),
         p.created_at, u.last_sign_in_at,
         count(*) over ()
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.profile_private pp on pp.id = p.id
  where (p_status is null or p.status = p_status)
    and (p_role is null or p.role = p_role)
    and (p_search is null or p_search = ''
         or p.full_name ilike '%' || p_search || '%'
         or u.email ilike '%' || p_search || '%'
         or pp.phone ilike '%' || p_search || '%')
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_set_user_status(
  p_user_id uuid,
  p_status public.account_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  r record;
begin
  if p_user_id = v_admin then
    raise exception 'cannot_moderate_self' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  update public.profiles
  set status = p_status,
      suspended_reason = case when p_status = 'suspended' then nullif(trim(p_reason), '') end
  where id = p_user_id;

  if p_status = 'suspended' then
    -- Free every seat the user holds and cancel the trips they drive.
    for r in select id from public.trips where driver_id = p_user_id and status = 'scheduled' loop
      perform public._cancel_trip(r.id, v_admin, 'account_suspended', true);
    end loop;
    for r in
      select b.id, b.trip_id, b.seats, t.driver_id
      from public.bookings b join public.trips t on t.id = b.trip_id
      where b.passenger_id = p_user_id and b.status in ('pending', 'confirmed') and t.status = 'scheduled'
    loop
      perform 1 from public.trips where id = r.trip_id for update;
      update public.bookings set status = 'cancelled', cancelled_by = v_admin, cancelled_at = now(),
             cancellation_reason = 'account_suspended'
      where id = r.id and status in ('pending', 'confirmed');
      if found then
        update public.trips set seats_available = seats_available + r.seats where id = r.trip_id;
        perform public.notify_user(r.driver_id, 'booking_cancelled',
          public.trip_summary(r.trip_id) || jsonb_build_object('booking_id', r.id, 'seats', r.seats, 'by_admin', true));
      end if;
    end loop;
  end if;

  perform public.notify_user(p_user_id, 'account_status',
    jsonb_build_object('status', p_status, 'reason', nullif(trim(p_reason), '')));

  insert into public.admin_actions (admin_id, action, target_type, target_id, details)
  values (v_admin, 'set_status', 'user', p_user_id, jsonb_build_object('status', p_status, 'reason', p_reason));
end;
$$;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
begin
  if p_user_id = v_admin then
    raise exception 'cannot_moderate_self' using errcode = 'P0001';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  insert into public.admin_actions (admin_id, action, target_type, target_id, details)
  values (v_admin, 'set_role', 'user', p_user_id, jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.admin_update_report(
  p_report_id uuid,
  p_status public.report_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
begin
  update public.reports
  set status = p_status,
      admin_note = coalesce(nullif(trim(p_note), ''), admin_note),
      resolved_by = case when p_status in ('resolved', 'dismissed') then v_admin end,
      resolved_at = case when p_status in ('resolved', 'dismissed') then now() end
  where id = p_report_id;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0001';
  end if;
  insert into public.admin_actions (admin_id, action, target_type, target_id, details)
  values (v_admin, 'update_report', 'report', p_report_id, jsonb_build_object('status', p_status, 'note', p_note));
end;
$$;

create or replace function public.admin_set_review_hidden(p_review_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
begin
  update public.reviews set is_hidden = p_hidden where id = p_review_id;
  if not found then
    raise exception 'review_not_found' using errcode = 'P0001';
  end if;
  insert into public.admin_actions (admin_id, action, target_type, target_id, details)
  values (v_admin, case when p_hidden then 'hide_review' else 'unhide_review' end, 'review', p_review_id, '{}'::jsonb);
end;
$$;

create or replace function public.admin_set_message_hidden(p_message_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
begin
  update public.messages set is_hidden = p_hidden where id = p_message_id;
  if not found then
    raise exception 'message_not_found' using errcode = 'P0001';
  end if;
  insert into public.admin_actions (admin_id, action, target_type, target_id, details)
  values (v_admin, case when p_hidden then 'hide_message' else 'unhide_message' end, 'message', p_message_id, '{}'::jsonb);
end;
$$;

-- Lets admins read the content a report points at (messages are otherwise private).
create or replace function public.admin_get_message(p_message_id uuid)
returns table (id uuid, conversation_id uuid, sender_id uuid, sender_name text, body text,
               is_hidden boolean, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
    select m.id, m.conversation_id, m.sender_id, p.full_name, m.body, m.is_hidden, m.created_at
    from public.messages m join public.profiles p on p.id = m.sender_id
    where m.id = p_message_id;
end;
$$;
