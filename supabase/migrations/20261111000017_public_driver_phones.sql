-- =============================================================================
-- Migration 17: drivers MAY show their phone number to signed-in members.
--
-- Opt-in only. get_public_driver_phones() returns a number when ALL hold:
--   * the caller is signed in and their own account is active (guests: never);
--   * the driver switched "show my number" on (profile_private.phone_public,
--     default false; changed only through set_my_phone_public());
--   * the driver's account is active and has a phone;
--   * the driver has at least one ride that is scheduled and not yet departed;
--   * the caller is within the reveal quota (see "Rate limit" below).
-- Changing the phone number withdraws consent: the new number needs a new opt-in.
-- Switching it off takes effect on the next request (nothing is cached).
-- Passengers' numbers are never returned. Max 100 ids per call.
-- profile_private keeps its RLS (owner + admins); get_trip_contacts() for
-- confirmed passengers (migration 9) is unchanged.
--
-- Rate limit: each signed-in viewer may receive at most 30 DIFFERENT drivers'
-- numbers per rolling hour and 100 per rolling 24 hours. Seeing a number again
-- within 24 hours is free, and so is one's own number. Past the quota, numbers
-- are simply left out (no error, nothing else revealed).
--
-- Rollback: supabase/rollback/20261111000017_public_driver_phones.down.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Consent columns
-- ---------------------------------------------------------------------------
alter table public.profile_private
  add column if not exists phone_public boolean not null default false,
  add column if not exists phone_public_at timestamptz;

comment on column public.profile_private.phone_public is
  'Driver consented to show their phone to signed-in members. Default off; set only via set_my_phone_public(); reset when the phone changes.';
comment on column public.profile_private.phone_public_at is
  'When the current consent was given; null while off.';

-- ---------------------------------------------------------------------------
-- 2. Privileges on profile_private, re-asserted exactly as migration 3 meant
--    them (no table-level INSERT/UPDATE/DELETE, so the consent columns cannot
--    be written through the API). Removes any broader grant added by hand.
-- ---------------------------------------------------------------------------
revoke all on public.profile_private from anon;
revoke insert, update, delete, truncate, references, trigger on public.profile_private from authenticated;
grant select on public.profile_private to authenticated;
grant insert (id, phone, date_of_birth) on public.profile_private to authenticated;
grant update (phone, date_of_birth) on public.profile_private to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Who saw which driver's number, for the rate limit only. Kept 24 hours.
--    No API access at all: only the security-definer functions below use it.
-- ---------------------------------------------------------------------------
create table if not exists public.phone_reveals (
  viewer_id   uuid not null references public.profiles(id) on delete cascade,
  driver_id   uuid not null references public.profiles(id) on delete cascade,
  revealed_at timestamptz not null default now(),
  primary key (viewer_id, driver_id)
);
create index if not exists phone_reveals_driver_idx on public.phone_reveals (driver_id);
create index if not exists phone_reveals_revealed_at_idx on public.phone_reveals (revealed_at);
alter table public.phone_reveals enable row level security;
revoke all on public.phone_reveals from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Consent: given or withdrawn by the driver only, with a server timestamp.
-- ---------------------------------------------------------------------------
create or replace function public.set_my_phone_public(p_public boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_phone text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if p_public is null then
    raise exception 'validation' using errcode = 'P0001';
  end if;
  select phone into v_phone from public.profile_private where id = v_uid;
  if p_public and v_phone is null then
    raise exception 'phone_required' using errcode = 'P0001';
  end if;
  update public.profile_private
     set phone_public = p_public,
         phone_public_at = case when not p_public then null when phone_public then phone_public_at else now() end
   where id = v_uid;
  return p_public;
end;
$$;

revoke all on function public.set_my_phone_public(boolean) from public, anon;
grant execute on function public.set_my_phone_public(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. A new number needs a new consent. Fires on every path that changes the
--    phone (profile form, phone verification, admin, SQL).
-- ---------------------------------------------------------------------------
create or replace function public.profile_private_reset_phone_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone is distinct from old.phone then
    new.phone_public := false;
    new.phone_public_at := null;
    delete from public.phone_reveals where driver_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.profile_private_reset_phone_consent() from public, anon, authenticated;

drop trigger if exists profile_private_reset_phone_consent on public.profile_private;
create trigger profile_private_reset_phone_consent before update of phone on public.profile_private
  for each row execute function public.profile_private_reset_phone_consent();

-- ---------------------------------------------------------------------------
-- 6. The lookup. Replaces the earlier unapplied draft (guests, no consent).
--    Volatile because it records reveals; supabase-js calls it with POST.
-- ---------------------------------------------------------------------------
drop function if exists public.get_public_driver_phones(uuid[]);

create function public.get_public_driver_phones(p_driver_ids uuid[])
returns table (driver_id uuid, phone text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid  uuid := auth.uid();
  v_hour integer;
  v_day  integer;
  v_left integer;
begin
  if v_uid is null
     or not exists (select 1 from public.profiles me where me.id = v_uid and me.status = 'active') then
    return;
  end if;

  -- One lookup at a time per viewer, so parallel requests cannot overspend.
  perform pg_advisory_xact_lock(hashtextextended('phone_reveals:' || v_uid::text, 0));
  delete from public.phone_reveals where revealed_at <= now() - interval '24 hours';
  select count(*) filter (where r.revealed_at > now() - interval '1 hour'), count(*)
    into v_hour, v_day
    from public.phone_reveals r where r.viewer_id = v_uid;
  v_left := greatest(0, least(30 - v_hour, 100 - v_day));

  return query
  with wanted as (
    select w.id, min(w.ord) as ord
    from unnest((p_driver_ids)[1:100]) with ordinality as w(id, ord)
    where w.id is not null
    group by w.id
  ),
  eligible as (
    select pp.id, pp.phone, wanted.ord,
           (pp.id = v_uid or exists (select 1 from public.phone_reveals r where r.viewer_id = v_uid and r.driver_id = pp.id)) as free
    from wanted
    join public.profile_private pp on pp.id = wanted.id
    join public.profiles p on p.id = pp.id
    where pp.phone_public
      and pp.phone is not null
      and p.status = 'active'
      and exists (
        select 1 from public.trips t
        where t.driver_id = pp.id and t.status = 'scheduled' and t.departure_at > now()
      )
  ),
  picked as (
    select e.id, e.phone, e.free from eligible e where e.free
    union all
    select n.id, n.phone, n.free from (select * from eligible e where not e.free order by e.ord limit v_left) n
  ),
  recorded as (
    insert into public.phone_reveals (viewer_id, driver_id)
    select v_uid, picked.id from picked where not picked.free
    on conflict do nothing
  )
  select picked.id, picked.phone from picked;
end;
$$;

revoke all on function public.get_public_driver_phones(uuid[]) from public, anon;
grant execute on function public.get_public_driver_phones(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Hardening found during review: migration 7 re-created admin_list_users(),
--    and a re-created function gets EXECUTE for PUBLIC (hence anon) by default.
--    require_admin() already refuses guests; this closes the grant itself.
-- ---------------------------------------------------------------------------
revoke execute on function public.admin_list_users(text, public.account_status, public.user_role, integer, integer) from public, anon;
grant execute on function public.admin_list_users(text, public.account_status, public.user_role, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Self-check: abort the whole migration if any privilege is not as intended.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select * from (values ('anon'), ('authenticated')) v(role) loop
    if has_table_privilege(r.role, 'public.profile_private', 'INSERT')
       or has_table_privilege(r.role, 'public.profile_private', 'UPDATE')
       or has_table_privilege(r.role, 'public.profile_private', 'DELETE')
       or has_table_privilege(r.role, 'public.profile_private', 'TRUNCATE')
       or has_column_privilege(r.role, 'public.profile_private', 'phone_public', 'INSERT, UPDATE')
       or has_column_privilege(r.role, 'public.profile_private', 'phone_public_at', 'INSERT, UPDATE')
       or has_column_privilege(r.role, 'public.profile_private', 'suspended_reason', 'INSERT, UPDATE')
       or has_table_privilege(r.role, 'public.phone_reveals', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
       or has_function_privilege(r.role, 'public.profile_private_reset_phone_consent()', 'EXECUTE') then
      raise exception 'migration 17 privilege check failed for role %', r.role;
    end if;
  end loop;
  if has_table_privilege('anon', 'public.profile_private', 'SELECT')
     or has_function_privilege('anon', 'public.get_public_driver_phones(uuid[])', 'EXECUTE')
     or has_function_privilege('anon', 'public.set_my_phone_public(boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_list_users(text, public.account_status, public.user_role, integer, integer)', 'EXECUTE') then
    raise exception 'migration 17 privilege check failed for guests';
  end if;
end;
$$;
