-- =============================================================================
-- Backfill for accounts created before migrations 8-10.
--
-- Only fills in what is missing, from what each user entered at signup. It never
-- overwrites a value, never deletes a row, and does not touch roles, statuses,
-- trips or bookings. Running it twice changes nothing.
--
-- Avatars cannot be backfilled: those users are asked for a photo when they
-- publish or book.
--
-- Rollback: none needed, see supabase/rollback/README.md.
-- =============================================================================

-- 1. Confirmed accounts with no profile.
insert into public.profiles (id, full_name, preferred_locale)
select
  u.id,
  left(coalesce(trim(u.raw_user_meta_data ->> 'full_name'), ''), 100),
  case when u.raw_user_meta_data ->> 'locale' in ('ar', 'fr', 'en')
       then (u.raw_user_meta_data ->> 'locale')::public.app_locale
       else 'fr'::public.app_locale end
from auth.users u
where u.email_confirmed_at is not null
  and not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- 2. Real profiles with no private row (the phone is filled in by step 3).
insert into public.profile_private (id)
select p.id
from public.profiles p
where not p.is_demo
  and not exists (select 1 from public.profile_private pp where pp.id = p.id)
on conflict (id) do nothing;

-- 3. Missing phone: use the signup number if it is valid.
update public.profile_private pp
set phone = u.raw_user_meta_data ->> 'phone'
from auth.users u
where u.id = pp.id
  and pp.phone is null
  and u.raw_user_meta_data ->> 'phone' ~ '^\+216[2-9][0-9]{7}$';

-- 4. Blank name: use the signup name.
update public.profiles p
set full_name = left(trim(u.raw_user_meta_data ->> 'full_name'), 100)
from auth.users u
where u.id = p.id
  and not p.is_demo
  and char_length(trim(p.full_name)) = 0
  and char_length(trim(coalesce(u.raw_user_meta_data ->> 'full_name', ''))) >= 2;
