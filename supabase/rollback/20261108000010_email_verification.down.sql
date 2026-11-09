-- Reverts migration 10: profile rows are created at signup again.
-- Turn Confirm email OFF in Supabase before running this.
--
-- on_auth_user_email_confirmed is deliberately left in place. Accounts still
-- waiting for confirmation have no profile yet, and this trigger creates it when
-- they confirm. For everyone else it does nothing (`on conflict do nothing`).

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
