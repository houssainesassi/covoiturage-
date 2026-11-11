-- =============================================================================
-- Migration 16: car rental listings (separate from carpooling).
--
-- NOT APPLIED TO PRODUCTION. The app hides the section unless RENTALS_ENABLED=true.
-- Legal: renting cars without a Transport Ministry licence is treated as the
-- unlawful "parallel market" in Tunisia, so listings are for licensed agencies
-- only (licence number required) and nothing is public until an admin has
-- checked the licence (status 'approved'). See docs/LEGAL.md.
--
-- Price is agreed directly between owner and customer: no price column, no payment.
-- fee_* columns only prepare a possible future symbolic fee; nothing charges it.
-- Additive only: no existing table or data is touched.
-- =============================================================================

create type public.rental_status as enum ('pending', 'approved', 'rejected', 'hidden');

create table public.rental_listings (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  agency_name      text not null check (char_length(btrim(agency_name)) between 2 and 100),
  licence_number   text not null check (char_length(btrim(licence_number)) between 3 and 50),
  vehicle_type     public.vehicle_type not null default 'sedan',
  brand            text not null check (char_length(btrim(brand)) between 1 and 50),
  model            text check (model is null or char_length(btrim(model)) between 1 and 50),
  year             integer check (year is null or year between 1970 and 2100),
  seats            smallint not null default 5 check (seats between 1 and 9),
  location_id      uuid not null references public.locations(id) on delete restrict,
  phone            text not null check (phone ~ '^\+216[2-9][0-9]{7}$'),
  conditions       text check (conditions is null or char_length(conditions) <= 1500),
  availability     text check (availability is null or char_length(availability) <= 300),
  photo_paths      text[] not null default '{}' check (cardinality(photo_paths) between 1 and 6),
  status           public.rental_status not null default 'pending',
  review_note      text check (review_note is null or char_length(review_note) <= 500),
  -- Future symbolic fee (in millimes). Recorded only, never collected by this app.
  fee_amount_millimes integer check (fee_amount_millimes is null or fee_amount_millimes >= 0),
  fee_status       text not null default 'none' check (fee_status in ('none', 'waived', 'due', 'paid')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index rental_listings_public_idx on public.rental_listings (status, location_id, created_at desc);
create index rental_listings_owner_idx on public.rental_listings (owner_id);

create trigger rental_listings_updated_at before update on public.rental_listings
  for each row execute function public.set_updated_at();

-- Photos must live in the owner's storage folder.
create or replace function public.rental_listings_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from unnest(new.photo_paths) p where p not like new.owner_id::text || '/%') then
    raise exception 'invalid_photo_path' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger rental_listings_validate before insert or update on public.rental_listings
  for each row execute function public.rental_listings_validate();

-- Owners create and delete; they cannot edit, approve or set fees.
alter table public.rental_listings enable row level security;
-- New tables inherit Supabase's default "grant all"; start from nothing.
revoke all on public.rental_listings from anon, authenticated;
grant select on public.rental_listings to anon, authenticated;
grant insert (owner_id, agency_name, licence_number, vehicle_type, brand, model, year, seats,
              location_id, phone, conditions, availability, photo_paths)
  on public.rental_listings to authenticated;
grant delete on public.rental_listings to authenticated;

create policy rental_listings_read on public.rental_listings for select
  using (status = 'approved' or owner_id = (select auth.uid()) or (select public.is_admin()));
create policy rental_listings_insert on public.rental_listings for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_active_user()));
create policy rental_listings_delete on public.rental_listings for delete to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));

-- Admin review (licence check) — the only way a listing becomes public.
create or replace function public.admin_set_rental_status(p_id uuid, p_status public.rental_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
begin
  update public.rental_listings
     set status = p_status, review_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id;
  if not found then
    raise exception 'rental_not_found' using errcode = 'P0001';
  end if;
  insert into public.admin_actions (admin_id, action, target_type, target_id, details)
  values (v_admin, 'set_rental_status', 'rental_listing', p_id, jsonb_build_object('status', p_status));
end;
$$;
revoke all on function public.admin_set_rental_status(uuid, public.rental_status, text) from public, anon;
grant execute on function public.admin_set_rental_status(uuid, public.rental_status, text) to authenticated;

-- Photo bucket, same rules as vehicles: public read, owner-folder writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rentals', 'rentals', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "rentals_read_own_folder" on storage.objects for select to authenticated
  using (bucket_id = 'rentals' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "rentals_insert_own_folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'rentals' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_active_user()));
create policy "rentals_delete_own_folder" on storage.objects for delete to authenticated
  using (bucket_id = 'rentals' and (storage.foldername(name))[1] = (select auth.uid())::text);
