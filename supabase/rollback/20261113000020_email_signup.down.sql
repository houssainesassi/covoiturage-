-- Reverts migration 20. Turn "Confirm email" OFF in Supabase Auth first, and
-- roll the app back to a version without /auth/confirm's button page if needed.
--
-- Data: no row is deleted or rewritten. Profiles created by migration 20 stay.
-- handle_new_user() goes back to migration 1 (production before migration 20):
-- profile rows are created at sign-up again.
--
-- on_auth_user_email_confirmed is deliberately left in place (dropping it needs
-- ownership of auth.users). With the function below it is harmless: for a user
-- who already has rows it does nothing (`on conflict do nothing`), and a user
-- still waiting for confirmation gets their rows when they confirm.

drop function if exists public.ensure_my_profile();

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

drop function if exists public.create_profile_rows(uuid, jsonb);

-- Allows duplicate numbers again (as before migration 20).
drop index if exists public.profile_private_phone_key;
