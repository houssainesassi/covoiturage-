-- =============================================================================
-- Mandatory email verification: profile rows are created only once the email
-- is confirmed. Until then the name, phone and locale wait in auth.users
-- (raw_user_meta_data).
--
-- Existing accounts are untouched: confirmed users keep their profile, role and
-- status. `on conflict do nothing` means a confirmation never overwrites a row.
--
-- Rollback: supabase/rollback/20261108000010_email_verification.down.sql
-- =============================================================================

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
  -- An invalid number must never abort the confirmation: drop it instead, and
  -- the user is asked for one when they publish or book.
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

-- on_auth_user_created stays in place: it still covers accounts inserted as
-- already confirmed (dashboard, admin API, auto-confirm).
-- Guarded rather than drop-and-create: dropping needs ownership of auth.users.
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
