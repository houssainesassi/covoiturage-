-- Reverts migration 15: back to migration 14 (email-only sign-ups, SMS-verified
-- phone needed to publish or book). Disable phone sign-ups in Supabase Auth first.
--
-- on_auth_user_phone_confirmed is left in place (dropping it needs ownership of
-- auth.users); with migration 10's handle_new_user it does nothing for accounts
-- without a confirmed email.

create or replace function public.require_complete_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
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

drop function if exists public.is_account_verified(uuid);
