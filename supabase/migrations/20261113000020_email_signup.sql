-- =============================================================================
-- Migration 20: email sign-up with mandatory email confirmation (2026-11-13).
--
-- Sign-up is email + password; Supabase Auth "Confirm email" sends a link and
-- the account is usable only once the email is confirmed. The phone number is a
-- required, UNVERIFIED profile field (no SMS): it is typed at sign-up, waits in
-- auth.users.raw_user_meta_data, and is copied to profile_private on confirmation.
--
-- 1. handle_new_user(): profile rows are created only once the email is
--    confirmed (on insert for accounts created already confirmed, otherwise on
--    confirmation). An unconfirmed sign-up leaves no profile behind.
--    A number that is invalid or already used by another account never blocks
--    the confirmation: it is left empty and asked for on /auth/complete-profile.
-- 2. One account per phone number: partial unique index on profile_private.phone.
--    The migration refuses to run if duplicates exist (nothing is changed).
-- 3. ensure_my_profile(): a confirmed user with no profile row (accounts created
--    before this migration) gets one from their own sign-up details. Only for the
--    caller, never overwrites, idempotent.
--
-- Existing accounts: no row of auth.users, profiles, trips, bookings, reviews or
-- messages is inserted, updated or deleted by this migration. Sessions are not
-- affected. Existing (auto-confirmed) accounts stay verified.
--
-- Works on the production schema (migrations 1-7), on 1-7 + 17 + 18, and after
-- migrations 8-18. Does not depend on migration 8, 15 or 19.
-- Rollback: supabase/rollback/20261113000020_email_signup.down.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Preflight: stop before changing anything if two profiles share a phone.
-- ---------------------------------------------------------------------------
do $$
declare
  v_dupes integer;
begin
  select count(*) into v_dupes
  from (select phone from public.profile_private where phone is not null group by phone having count(*) > 1) d;
  if v_dupes > 0 then
    raise exception 'migration 20 stopped: % phone number(s) are shared by several profiles; resolve them first (nothing was changed)', v_dupes;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. One account per phone number.
-- ---------------------------------------------------------------------------
create unique index if not exists profile_private_phone_key
  on public.profile_private (phone)
  where phone is not null;

-- ---------------------------------------------------------------------------
-- 2. Profile rows from sign-up details. Internal: called by the trigger and by
--    ensure_my_profile(), never through the API.
-- ---------------------------------------------------------------------------
create or replace function public.create_profile_rows(p_user_id uuid, p_meta jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name   text := left(coalesce(trim(p_meta ->> 'full_name'), ''), 100);
  v_locale text := p_meta ->> 'locale';
  v_phone  text := p_meta ->> 'phone';
begin
  if v_locale is null or v_locale not in ('ar', 'fr', 'en') then
    v_locale := 'fr';
  end if;
  -- Same rule as profile_private_phone_check (migration 1) and TN_PHONE_REGEX.
  if v_phone is not null and v_phone !~ '^\+216[2-9][0-9]{7}$' then
    v_phone := null;
  end if;
  -- Already used by another account: leave it empty, the profile step asks again.
  if v_phone is not null and exists (
    select 1 from public.profile_private where phone = v_phone and id <> p_user_id
  ) then
    v_phone := null;
  end if;

  insert into public.profiles (id, full_name, preferred_locale)
  values (p_user_id, v_name, v_locale::public.app_locale)
  on conflict (id) do nothing;

  begin
    -- A private row that exists without a phone gets the sign-up number; a saved number is never overwritten.
    insert into public.profile_private (id, phone)
    values (p_user_id, v_phone)
    on conflict (id) do update
      set phone = excluded.phone
      where public.profile_private.phone is null and excluded.phone is not null;
  exception when unique_violation then
    -- Two confirmations with the same number at the same moment: keep the account, drop the number.
    insert into public.profile_private (id, phone)
    values (p_user_id, null)
    on conflict (id) do nothing;
  end;
end;
$$;
revoke all on function public.create_profile_rows(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Trigger function: nothing until the email is confirmed.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is null then
    return new;
  end if;
  perform public.create_profile_rows(new.id, coalesce(new.raw_user_meta_data, '{}'::jsonb));
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- on_auth_user_created (migration 1, after insert) stays: it covers accounts
-- created already confirmed. This one covers confirmation by link. Guarded
-- rather than drop-and-create: dropping needs ownership of auth.users.
-- Migration 10, if applied earlier, created the same trigger.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'on_auth_user_email_confirmed'
      and tgrelid = 'auth.users'::regclass
      and not tgisinternal
  ) then
    create trigger on_auth_user_email_confirmed
      after update on auth.users
      for each row
      when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
      execute function public.handle_new_user();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. ensure_my_profile(): self-repair for confirmed accounts without a profile.
--    Returns true when the caller has a profile row afterwards.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_my_profile()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_meta jsonb;
begin
  if v_uid is null then
    return false;
  end if;
  select coalesce(u.raw_user_meta_data, '{}'::jsonb) into v_meta
  from auth.users u
  where u.id = v_uid and u.email_confirmed_at is not null;
  if not found then
    return false;
  end if;
  if not exists (select 1 from public.profiles where id = v_uid)
     or not exists (select 1 from public.profile_private where id = v_uid) then
    perform public.create_profile_rows(v_uid, v_meta);
  end if;
  return exists (select 1 from public.profiles where id = v_uid);
end;
$$;
revoke all on function public.ensure_my_profile() from public, anon;
grant execute on function public.ensure_my_profile() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Self-check: abort the whole migration if anything is not as intended.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  -- Privileges.
  for r in select * from (values ('anon'), ('authenticated')) v(role) loop
    if has_function_privilege(r.role, 'public.create_profile_rows(uuid, jsonb)', 'EXECUTE')
       or has_function_privilege(r.role, 'public.handle_new_user()', 'EXECUTE')
       or has_table_privilege(r.role, 'public.profile_private', 'DELETE, TRUNCATE') then
      raise exception 'migration 20 privilege check failed for role %', r.role;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.ensure_my_profile()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.ensure_my_profile()', 'EXECUTE')
     or has_table_privilege('anon', 'public.profile_private', 'SELECT') then
    raise exception 'migration 20 privilege check failed (ensure_my_profile / guests)';
  end if;
  -- Definer functions: SECURITY DEFINER with an empty search_path, owned by the migration role.
  for r in
    select p.proname, p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) as owner
    from pg_catalog.pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('create_profile_rows', 'handle_new_user', 'ensure_my_profile')
  loop
    if not r.prosecdef or r.proconfig is null or not ('search_path=""' = any (r.proconfig)) then
      raise exception 'migration 20: % must be SECURITY DEFINER with search_path=''''', r.proname;
    end if;
    if r.owner <> current_user then
      raise exception 'migration 20: % is owned by %, expected %', r.proname, r.owner, current_user;
    end if;
  end loop;
  -- RLS stays on.
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.profile_private'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.profiles'::regclass) then
    raise exception 'migration 20: RLS must stay enabled on profiles and profile_private';
  end if;
  -- Objects in place.
  if not exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'profile_private_phone_key')
     or not exists (select 1 from pg_catalog.pg_trigger where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass)
     or not exists (select 1 from pg_catalog.pg_trigger where tgname = 'on_auth_user_email_confirmed' and tgrelid = 'auth.users'::regclass) then
    raise exception 'migration 20: index or auth.users triggers missing';
  end if;
end;
$$;
