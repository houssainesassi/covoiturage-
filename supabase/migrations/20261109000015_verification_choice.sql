-- =============================================================================
-- Email verification is the only verification (2026-11-11).
--
-- Sign-up: signUp({ email, password }) + the 6-digit email code (type 'email').
-- An account is verified ONLY when Supabase Auth confirmed its email
-- (auth.users.email_confirmed_at). A confirmed phone is never an alternative,
-- and the phone number is never verified: it is a plain profile field.
--
-- Publishing and booking need a complete profile (migration 8) and a confirmed
-- email. Existing users: nothing is deleted or rewritten. Every account that can
-- sign in today has a confirmed email, so it keeps working.
--
-- The phone typed at sign-up waits in raw_user_meta_data until the email code is
-- verified, then is copied to profile_private (never lost, never overwritten).
--
-- Depends on migration 8 (is_profile_complete) and migration 10 (profile created
-- on email confirmation). Migration 14 is empty.
-- Rollback: supabase/rollback/20261109000015_verification_choice.down.sql
-- =============================================================================

create or replace function public.is_account_verified(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_user_id
      and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.is_account_verified(uuid) from public, anon, authenticated;

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
  if not public.is_account_verified(v_user) then
    raise exception 'account_unverified' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Same as migration 10, plus: a private row that exists without a phone gets the
-- sign-up number on confirmation. A number already saved is never overwritten.
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
  if new.email_confirmed_at is null then
    return new;
  end if;
  if v_locale is null or v_locale not in ('ar', 'fr', 'en') then
    v_locale := 'fr';
  end if;
  -- An invalid number must never abort the confirmation: drop it instead.
  if v_phone is not null and v_phone !~ '^\+216[2-9][0-9]{7}$' then
    v_phone := null;
  end if;

  insert into public.profiles (id, full_name, preferred_locale)
  values (new.id, v_name, v_locale::public.app_locale)
  on conflict (id) do nothing;

  insert into public.profile_private (id, phone)
  values (new.id, v_phone)
  on conflict (id) do update
    set phone = excluded.phone
    where public.profile_private.phone is null and excluded.phone is not null;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Optional Before User Created hook: every sign-up needs an email address, so
-- phone-only accounts can never be created even if the Phone provider is turned
-- on by mistake. Takes effect only once selected in Dashboard > Authentication >
-- Hooks; the app works without it.
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
