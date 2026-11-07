-- =============================================================================
-- Wasalni — Covoiturage Tunisie
-- Migration 1: core schema (types, tables, constraints, indexes, base triggers)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('user', 'admin');
create type public.account_status as enum ('active', 'suspended');
create type public.app_locale as enum ('ar', 'fr', 'en');
create type public.trip_status as enum ('scheduled', 'cancelled', 'completed');
create type public.booking_status as enum ('pending', 'confirmed', 'rejected', 'cancelled', 'completed');
create type public.vehicle_type as enum ('sedan', 'hatchback', 'suv', 'van', 'minibus', 'pickup', 'other');
create type public.luggage_size as enum ('none', 'small', 'medium', 'large');
create type public.report_reason as enum (
  'inappropriate_behavior', 'harassment', 'fraud', 'no_show',
  'dangerous_driving', 'fake_profile', 'spam', 'other'
);
create type public.report_status as enum ('open', 'in_review', 'resolved', 'dismissed');
create type public.notification_type as enum (
  'booking_request', 'booking_confirmed', 'booking_rejected', 'booking_cancelled',
  'new_message', 'trip_updated', 'trip_cancelled', 'trip_reminder',
  'trip_completed', 'review_received', 'account_status'
);

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Geography: governorates & locations (real Tunisian places, seeded later)
-- ---------------------------------------------------------------------------
create table public.governorates (
  code        text primary key check (code ~ '^[a-z-]+$'),
  name_fr     text not null,
  name_ar     text not null,
  name_en     text not null
);

create table public.locations (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9-]+$'),
  governorate_code  text not null references public.governorates(code) on update cascade on delete restrict,
  name_fr           text not null,
  name_ar           text not null,
  name_en           text not null,
  kind              text not null default 'city' check (kind in ('city', 'airport')),
  is_capital        boolean not null default false,
  lat               double precision not null check (lat between 30 and 38),
  lng               double precision not null check (lng between 7 and 12.5),
  popularity        integer not null default 0,
  created_at        timestamptz not null default now()
);
create index locations_governorate_idx on public.locations (governorate_code);

-- ---------------------------------------------------------------------------
-- Profiles (public part) & private profile data
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  full_name         text not null default '' check (char_length(full_name) <= 100),
  avatar_path       text check (avatar_path is null or avatar_path like (id::text || '/%')),
  bio               text check (bio is null or char_length(bio) <= 500),
  city_id           uuid references public.locations(id) on delete set null,
  preferred_locale  public.app_locale not null default 'fr',
  role              public.user_role not null default 'user',
  status            public.account_status not null default 'active',
  suspended_reason  text,
  rating_avg        numeric(3,2) not null default 0 check (rating_avg between 0 and 5),
  rating_count      integer not null default 0 check (rating_count >= 0),
  trips_driven      integer not null default 0 check (trips_driven >= 0),
  trips_taken       integer not null default 0 check (trips_taken >= 0),
  pref_smoking      boolean not null default false,
  pref_pets         boolean not null default false,
  pref_music        boolean not null default true,
  pref_chatty       boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index profiles_status_idx on public.profiles (status);
create index profiles_role_idx on public.profiles (role) where role = 'admin';
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Sensitive personal data, never publicly readable.
create table public.profile_private (
  id              uuid primary key references public.profiles(id) on delete cascade,
  -- Tunisian numbers in E.164: +216 followed by 8 digits (mobile 2/4/5/9, fixed 3/7)
  phone           text check (phone is null or phone ~ '^\+216[2-9][0-9]{7}$'),
  date_of_birth   date check (date_of_birth is null or date_of_birth between date '1900-01-01' and (current_date - interval '16 years')::date),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger profile_private_updated_at before update on public.profile_private
  for each row execute function public.set_updated_at();

-- Create the profile rows automatically when an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name   text := left(coalesce(trim(new.raw_user_meta_data ->> 'full_name'), ''), 100);
  v_locale text := new.raw_user_meta_data ->> 'locale';
  v_phone  text := new.raw_user_meta_data ->> 'phone';
begin
  if v_locale is null or v_locale not in ('ar', 'fr', 'en') then
    v_locale := 'fr';
  end if;
  if v_phone is not null and v_phone !~ '^\+216[2-9][0-9]{7}$' then
    v_phone := null;
  end if;

  insert into public.profiles (id, full_name, preferred_locale)
  values (new.id, v_name, v_locale::public.app_locale)
  on conflict (id) do nothing;

  insert into public.profile_private (id, phone)
  values (new.id, v_phone)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Vehicles
-- ---------------------------------------------------------------------------
create table public.vehicles (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  type          public.vehicle_type not null default 'sedan',
  brand         text not null check (char_length(trim(brand)) between 1 and 50),
  model         text not null check (char_length(trim(model)) between 1 and 50),
  color         text not null check (char_length(trim(color)) between 1 and 30),
  year          smallint check (year is null or year between 1970 and 2100),
  seats         smallint not null check (seats between 1 and 8),
  plate_number  text check (plate_number is null or char_length(plate_number) between 2 and 20),
  photo_paths   text[] not null default '{}' check (cardinality(photo_paths) <= 6),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index vehicles_owner_idx on public.vehicles (owner_id);
create trigger vehicles_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();

-- Photos must live inside the owner's storage folder.
create or replace function public.validate_vehicle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p text;
begin
  foreach p in array new.photo_paths loop
    if p not like (new.owner_id::text || '/%') or p like '%..%' then
      raise exception 'invalid_photo_path' using errcode = 'P0001';
    end if;
  end loop;
  if new.year is not null and new.year > extract(year from now())::int + 1 then
    raise exception 'invalid_vehicle_year' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger vehicles_validate before insert or update on public.vehicles
  for each row execute function public.validate_vehicle();

-- ---------------------------------------------------------------------------
-- Trips
-- ---------------------------------------------------------------------------
create table public.trips (
  id                    uuid primary key default gen_random_uuid(),
  driver_id             uuid not null references public.profiles(id) on delete cascade,
  vehicle_id            uuid references public.vehicles(id) on delete restrict,
  origin_id             uuid not null references public.locations(id) on delete restrict,
  destination_id        uuid not null references public.locations(id) on delete restrict,
  origin_address        text not null check (char_length(trim(origin_address)) between 2 and 200),
  destination_address   text not null check (char_length(trim(destination_address)) between 2 and 200),
  origin_lat            double precision not null check (origin_lat between 30 and 38),
  origin_lng            double precision not null check (origin_lng between 7 and 12.5),
  destination_lat       double precision not null check (destination_lat between 30 and 38),
  destination_lng       double precision not null check (destination_lng between 7 and 12.5),
  departure_at          timestamptz not null,
  seats_total           smallint not null check (seats_total between 1 and 8),
  seats_available       smallint not null,
  price_per_seat        numeric(8,3) not null check (price_per_seat >= 1 and price_per_seat <= 500),
  distance_km           numeric(7,1) check (distance_km is null or distance_km >= 0),
  duration_min          integer check (duration_min is null or duration_min >= 0),
  auto_accept           boolean not null default false,
  luggage_size          public.luggage_size not null default 'medium',
  description           text check (description is null or char_length(description) <= 1000),
  status                public.trip_status not null default 'scheduled',
  cancellation_reason   text check (cancellation_reason is null or char_length(cancellation_reason) <= 500),
  cancelled_at          timestamptz,
  completed_at          timestamptz,
  reminder_sent_at      timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint trips_distinct_cities check (origin_id <> destination_id),
  constraint trips_seats_available_range check (seats_available between 0 and seats_total)
);
create index trips_search_idx on public.trips (origin_id, destination_id, departure_at) where status = 'scheduled';
create index trips_scheduled_departure_idx on public.trips (departure_at) where status = 'scheduled';
create index trips_driver_idx on public.trips (driver_id, departure_at desc);
create index trips_vehicle_idx on public.trips (vehicle_id);
create index trips_created_idx on public.trips (created_at desc);
create trigger trips_updated_at before update on public.trips
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table public.bookings (
  id                   uuid primary key default gen_random_uuid(),
  trip_id              uuid not null references public.trips(id) on delete cascade,
  passenger_id         uuid not null references public.profiles(id) on delete cascade,
  seats                smallint not null check (seats between 1 and 8),
  -- price snapshot taken from the trip by the server at booking time
  price_per_seat       numeric(8,3) not null check (price_per_seat >= 0),
  total_price          numeric(9,3) generated always as (seats * price_per_seat) stored,
  status               public.booking_status not null default 'pending',
  message              text check (message is null or char_length(message) <= 500),
  cancelled_by         uuid references public.profiles(id) on delete set null,
  cancellation_reason  text check (cancellation_reason is null or char_length(cancellation_reason) <= 500),
  responded_at         timestamptz,
  cancelled_at         timestamptz,
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
-- A passenger can hold at most one active booking per trip.
create unique index bookings_one_active_per_trip
  on public.bookings (trip_id, passenger_id)
  where status in ('pending', 'confirmed');
create index bookings_trip_status_idx on public.bookings (trip_id, status);
create index bookings_passenger_idx on public.bookings (passenger_id, created_at desc);
create trigger bookings_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Conversations & messages
-- ---------------------------------------------------------------------------
create table public.conversations (
  id                    uuid primary key default gen_random_uuid(),
  trip_id               uuid not null references public.trips(id) on delete cascade,
  driver_id             uuid not null references public.profiles(id) on delete cascade,
  passenger_id          uuid not null references public.profiles(id) on delete cascade,
  last_message_at       timestamptz,
  last_message_preview  text,
  last_sender_id        uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  constraint conversations_unique_pair unique (trip_id, passenger_id),
  constraint conversations_distinct_users check (driver_id <> passenger_id)
);
create index conversations_driver_idx on public.conversations (driver_id, last_message_at desc nulls last);
create index conversations_passenger_idx on public.conversations (passenger_id, last_message_at desc nulls last);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid not null references public.profiles(id) on delete cascade,
  body             text not null check (char_length(trim(body)) between 1 and 2000),
  read_at          timestamptz,
  is_hidden        boolean not null default false,
  created_at       timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_unread_idx on public.messages (conversation_id, sender_id) where read_at is null;
create index messages_sender_recent_idx on public.messages (sender_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        public.notification_type not null,
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
create table public.reviews (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references public.trips(id) on delete cascade,
  reviewer_id    uuid not null references public.profiles(id) on delete cascade,
  reviewee_id    uuid not null references public.profiles(id) on delete cascade,
  reviewee_role  text not null check (reviewee_role in ('driver', 'passenger')),
  rating         smallint not null check (rating between 1 and 5),
  comment        text check (comment is null or char_length(comment) <= 1000),
  is_hidden      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint reviews_unique_per_trip unique (trip_id, reviewer_id, reviewee_id),
  constraint reviews_distinct_users check (reviewer_id <> reviewee_id)
);
create index reviews_reviewee_idx on public.reviews (reviewee_id, created_at desc);
create index reviews_reviewer_idx on public.reviews (reviewer_id, created_at desc);
create trigger reviews_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Reports (moderation)
-- ---------------------------------------------------------------------------
create table public.reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references public.profiles(id) on delete cascade,
  reported_user_id  uuid not null references public.profiles(id) on delete cascade,
  trip_id           uuid references public.trips(id) on delete set null,
  message_id        uuid references public.messages(id) on delete set null,
  review_id         uuid references public.reviews(id) on delete set null,
  reason            public.report_reason not null,
  details           text check (details is null or char_length(details) <= 2000),
  status            public.report_status not null default 'open',
  admin_note        text check (admin_note is null or char_length(admin_note) <= 2000),
  resolved_by       uuid references public.profiles(id) on delete set null,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint reports_distinct_users check (reporter_id <> reported_user_id)
);
create index reports_status_idx on public.reports (status, created_at desc);
create index reports_reported_idx on public.reports (reported_user_id);
create index reports_reporter_recent_idx on public.reports (reporter_id, created_at desc);
create trigger reports_updated_at before update on public.reports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Admin audit log
-- ---------------------------------------------------------------------------
create table public.admin_actions (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid references public.profiles(id) on delete set null,
  action       text not null,
  target_type  text not null,
  target_id    uuid,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index admin_actions_created_idx on public.admin_actions (created_at desc);
