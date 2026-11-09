-- =============================================================================
-- Phone number verification by SMS code (Supabase Auth phone change OTP).
--
-- The number is attached to the user's existing account with
-- auth.updateUser({ phone }) + verifyOtp({ type: 'phone_change' }), so no second
-- account is ever created. Supabase keeps auth.users.phone unique: a number that
-- is already verified on another account is refused by Auth itself.
--
-- A phone is verified when auth.users.phone_confirmed_at is set AND the number
-- shown to passengers (profile_private.phone) is that same number. Changing the
-- profile number therefore needs a new SMS code.
--
-- Nothing is deleted or overwritten for existing users: they keep their profile,
-- trips and bookings, and only need to verify before their NEXT publish or
-- booking (the triggers fire on insert only, demo rows are skipped).
--
-- Depends on migration 8 (is_profile_complete, require_complete_profile).
-- Rollback: supabase/rollback/20261109000014_phone_verification.down.sql
-- =============================================================================

-- auth.users.phone is stored without the leading '+' (e.g. 21622123456).
create or replace function public.is_phone_verified(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.profile_private pp on pp.id = u.id
    where u.id = p_user_id
      and u.phone_confirmed_at is not null
      and u.phone is not null
      and pp.phone = '+' || u.phone
  );
$$;
revoke all on function public.is_phone_verified(uuid) from public, anon, authenticated;

-- Publishing and booking need a complete profile (migration 8) and a verified phone.
create or replace function public.require_complete_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- tg_argv[0] names the column holding the acting user (driver_id / passenger_id).
  v_user uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  if not public.is_profile_complete(v_user) then
    raise exception 'profile_incomplete' using errcode = 'P0001';
  end if;
  if not public.is_phone_verified(v_user) then
    raise exception 'phone_unverified' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Once Auth confirms a number, it becomes the profile number shown to passengers.
create or replace function public.sync_verified_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := '+' || new.phone;
begin
  -- Same rule as TN_PHONE_REGEX in src/lib/phone.ts and migration 8.
  if new.phone is null or new.phone_confirmed_at is null or v_phone !~ '^\+216[2-9][0-9]{7}$' then
    return new;
  end if;
  update public.profile_private set phone = v_phone
  where id = new.id and phone is distinct from v_phone;
  -- No private row yet (profile created later): only insert when the profile exists.
  insert into public.profile_private (id, phone)
  select new.id, v_phone
  where exists (select 1 from public.profiles p where p.id = new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.sync_verified_phone() from public, anon, authenticated;

-- Guarded rather than drop-and-create: dropping needs ownership of auth.users.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'on_auth_user_phone_verified'
      and tgrelid = 'auth.users'::regclass
      and not tgisinternal
  ) then
    create trigger on_auth_user_phone_verified
      after update on auth.users
      for each row
      when (
        new.phone_confirmed_at is not null
        and (old.phone is distinct from new.phone or old.phone_confirmed_at is distinct from new.phone_confirmed_at)
      )
      execute function public.sync_verified_phone();
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Abuse protection: enabling the Phone provider also opens phone-only sign-ups
-- (signUp / signInWithOtp with a phone) on the public Auth API, which would let
-- anyone make the project send SMS to any number. Accounts must start with an
-- email, so refuse every sign-up without one.
--
-- Takes effect only once it is selected in Dashboard > Authentication > Hooks >
-- "Before User Created" (Postgres function public.hook_before_user_created).
-- -----------------------------------------------------------------------------
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(trim(event -> 'user' ->> 'email'), '') = '' then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Sign up with an email address.'
    ));
  end if;
  return '{}'::jsonb;
end;
$$;
revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
