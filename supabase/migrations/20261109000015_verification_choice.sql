-- =============================================================================
-- Sign-up verification by email OR by phone, as the user chooses.
--
--   * Email method: signUp({ email, password }) + 6-digit email code (type 'email').
--   * Phone method: signUp({ phone, password }) + 6-digit SMS code (type 'sms').
--     The account's login identifier is then the +216 number.
--
-- An account is verified when Supabase Auth confirmed its email OR its phone.
-- That is now what publishing and booking need (with a complete profile),
-- instead of an SMS-verified phone for everyone (migration 14).
--
-- Existing users: nothing is deleted or rewritten. Every account that can sign in
-- today has a confirmed email, so it counts as verified and keeps working.
--
-- Depends on migrations 8, 10 and 14.
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
      and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
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

-- Profiles are created once the account is confirmed, by email or by phone.
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
  if new.email_confirmed_at is null and new.phone_confirmed_at is null then
    return new;
  end if;
  if v_locale is null or v_locale not in ('ar', 'fr', 'en') then
    v_locale := 'fr';
  end if;
  -- A phone account's own confirmed number wins over the metadata copy.
  if new.phone_confirmed_at is not null and new.phone is not null then
    v_phone := '+' || ltrim(new.phone, '+');
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
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Phone sign-ups are confirmed by an UPDATE setting phone_confirmed_at.
-- Fires before on_auth_user_phone_verified (triggers run in name order), so the
-- profile exists when that one copies the number.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'on_auth_user_phone_confirmed'
      and tgrelid = 'auth.users'::regclass
      and not tgisinternal
  ) then
    create trigger on_auth_user_phone_confirmed
      after update on auth.users
      for each row
      when (old.phone_confirmed_at is null and new.phone_confirmed_at is not null)
      execute function public.handle_new_user();
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Before User Created hook: sign-ups need an email, or a Tunisian (+216) mobile
-- number. Refusing other countries stops SMS pumping to premium-rate numbers.
-- Takes effect only once selected in Dashboard > Authentication > Hooks.
-- -----------------------------------------------------------------------------
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_email text := coalesce(trim(event -> 'user' ->> 'email'), '');
  v_phone text := ltrim(coalesce(trim(event -> 'user' ->> 'phone'), ''), '+');
begin
  if v_email <> '' then
    return '{}'::jsonb;
  end if;
  if v_phone ~ '^216[2-9][0-9]{7}$' then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Sign up with an email address or a Tunisian (+216) phone number.'
  ));
end;
$$;
revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
