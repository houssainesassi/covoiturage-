-- =============================================================================
-- Moves suspended_reason out of public.profiles, which anyone can read with the
-- publishable key, into public.profile_private (the owner and admins only).
--
-- Every existing reason is copied before the old column is dropped. Users can
-- read their own reason but cannot change it: the insert and update grants on
-- profile_private list their columns, and this one is not among them.
--
-- Rollback: supabase/rollback/20261108000013_private_suspension_reason.down.sql
-- =============================================================================

alter table public.profile_private add column if not exists suspended_reason text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'suspended_reason'
  ) then
    insert into public.profile_private (id, suspended_reason)
    select p.id, p.suspended_reason
    from public.profiles p
    where p.suspended_reason is not null
    on conflict (id) do update set suspended_reason = excluded.suspended_reason;

    alter table public.profiles drop column suspended_reason;
  end if;
end;
$$;

-- Same signature and result as migration 7; only the source of the reason changes.
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
  select p.id, p.full_name, u.email::text, pp.phone, p.avatar_path, p.role, p.status, pp.suspended_reason,
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

-- Same behavior as migration 2; only where the reason is stored changes.
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

  update public.profiles set status = p_status where id = p_user_id;

  insert into public.profile_private (id, suspended_reason)
  values (p_user_id, case when p_status = 'suspended' then nullif(trim(p_reason), '') end)
  on conflict (id) do update set suspended_reason = excluded.suspended_reason;

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

notify pgrst, 'reload schema';
