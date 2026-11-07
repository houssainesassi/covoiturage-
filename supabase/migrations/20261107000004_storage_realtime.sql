-- =============================================================================
-- Migration 4: Storage buckets/policies and Realtime publication.
-- =============================================================================

-- Public-read buckets with server-enforced size & MIME limits.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',  'avatars',  true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('vehicles', 'vehicles', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Users may only write inside a folder named after their own user id:
--   avatars/<uid>/<file>, vehicles/<uid>/<file>
create policy "media_read_own_folder" on storage.objects for select to authenticated
  using (
    bucket_id in ('avatars', 'vehicles')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "media_insert_own_folder" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('avatars', 'vehicles')
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active_user())
  );

create policy "media_update_own_folder" on storage.objects for update to authenticated
  using (
    bucket_id in ('avatars', 'vehicles')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id in ('avatars', 'vehicles')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "media_delete_own_folder" on storage.objects for delete to authenticated
  using (
    bucket_id in ('avatars', 'vehicles')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Realtime: stream changes for in-app notifications and chat.
-- RLS applies to postgres_changes, so users only receive their own rows.
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.bookings;
