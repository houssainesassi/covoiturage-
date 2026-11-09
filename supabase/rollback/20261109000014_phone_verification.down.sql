-- Reverts migration 14: publishing and booking no longer require a verified phone.
-- First unselect the "Before User Created" hook in Dashboard > Authentication > Hooks.
--
-- on_auth_user_phone_verified is left in place (dropping it needs ownership of
-- auth.users). Without the check below it only keeps the profile number equal to
-- the number the user verified, which is harmless.

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
  return new;
end;
$$;

drop function if exists public.hook_before_user_created(jsonb);
drop function if exists public.is_phone_verified(uuid);
