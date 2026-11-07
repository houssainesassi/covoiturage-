-- =============================================================================
-- Migration 7: demo / historical example data support.
--
-- Demo records are flagged with is_demo = true. Demo profiles are display-only:
-- they have NO Supabase Auth account, so nobody can sign in as them. Real
-- profiles must still belong to an auth user (enforced by trigger below).
-- Demo trips are always in the past and never 'scheduled', so they can never
-- appear in searches or be booked. Clients cannot set is_demo (no column grant).
-- =============================================================================

alter table public.profiles add column is_demo boolean not null default false;
alter table public.vehicles add column is_demo boolean not null default false;
alter table public.trips    add column is_demo boolean not null default false;
alter table public.bookings add column is_demo boolean not null default false;
alter table public.reviews  add column is_demo boolean not null default false;

create index trips_demo_idx on public.trips (is_demo) where is_demo;

-- Demo trips are historical only.
alter table public.trips add constraint trips_demo_not_scheduled check (not is_demo or status <> 'scheduled');

-- ---------------------------------------------------------------------------
-- profiles: replace the hard FK to auth.users by an equivalent trigger that
-- exempts demo profiles, and keep the cascade on auth user deletion.
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint profiles_id_fkey;

create or replace function public.profiles_require_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.is_demo and not exists (select 1 from auth.users where id = new.id) then
    raise exception 'profile_requires_auth_user' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.is_demo is distinct from old.is_demo then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger profiles_require_auth_user before insert or update of is_demo on public.profiles
  for each row execute function public.profiles_require_auth_user();

create or replace function public.handle_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.profiles where id = old.id and not is_demo;
  return old;
end;
$$;
create trigger on_auth_user_deleted after delete on auth.users
  for each row execute function public.handle_deleted_user();

-- ---------------------------------------------------------------------------
-- Demo consistency: demo rows may only reference demo rows, and real rows may
-- never reference demo people.
-- ---------------------------------------------------------------------------
create or replace function public.check_demo_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if tg_table_name = 'vehicles' then
    select is_demo = new.is_demo into v_ok from public.profiles where id = new.owner_id;
  elsif tg_table_name = 'bookings' then
    select (t.is_demo = new.is_demo) and (p.is_demo = new.is_demo) into v_ok
    from public.trips t, public.profiles p where t.id = new.trip_id and p.id = new.passenger_id;
  elsif tg_table_name = 'reviews' then
    select (t.is_demo = new.is_demo) and (a.is_demo = new.is_demo) and (b.is_demo = new.is_demo) into v_ok
    from public.trips t, public.profiles a, public.profiles b
    where t.id = new.trip_id and a.id = new.reviewer_id and b.id = new.reviewee_id;
  end if;
  if not coalesce(v_ok, false) then
    raise exception 'demo_mismatch' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger vehicles_demo_check before insert on public.vehicles for each row execute function public.check_demo_consistency();
create trigger bookings_demo_check before insert on public.bookings for each row execute function public.check_demo_consistency();
create trigger reviews_demo_check  before insert on public.reviews  for each row execute function public.check_demo_consistency();

-- Trips: demo trips skip the "future departure" rules but must be in the past,
-- driven by a demo profile. Real trips can never be driven by a demo profile.
create or replace function public.trips_demo_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_demo boolean;
begin
  select is_demo into v_driver_demo from public.profiles where id = new.driver_id;
  if coalesce(v_driver_demo, false) is distinct from new.is_demo then
    raise exception 'demo_mismatch' using errcode = 'P0001';
  end if;
  if new.is_demo and new.departure_at >= now() then
    raise exception 'demo_must_be_past' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trips_a_demo_guard before insert on public.trips
  for each row execute function public.trips_demo_guard();

-- Existing insert validation (forces 'scheduled', future departure…) applies to real trips only.
drop trigger trips_validate_insert on public.trips;
create trigger trips_validate_insert before insert on public.trips
  for each row when (not new.is_demo) execute function public.trips_before_insert();

-- ---------------------------------------------------------------------------
-- Functions updated for demo data
-- ---------------------------------------------------------------------------
-- search_trips: defence in depth — demo trips are never searchable.
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
      and not t.is_demo
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

drop function public.admin_list_users(text, public.account_status, public.user_role, integer, integer);
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
  reports_count bigint, created_at timestamptz, last_sign_in_at timestamptz, is_demo boolean, total_count bigint
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
         p.created_at, u.last_sign_in_at, p.is_demo,
         count(*) over ()
  from public.profiles p
  left join auth.users u on u.id = p.id
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

grant execute on function public.admin_list_users(text, public.account_status, public.user_role, integer, integer) to authenticated;

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
    'demo_trips', (select count(*) from public.trips where is_demo),
    'demo_users', (select count(*) from public.profiles where is_demo),
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

revoke all on function public.profiles_require_auth_user() from public, anon, authenticated;
revoke all on function public.handle_deleted_user() from public, anon, authenticated;
revoke all on function public.check_demo_consistency() from public, anon, authenticated;
revoke all on function public.trips_demo_guard() from public, anon, authenticated;
