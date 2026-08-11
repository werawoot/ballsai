-- BallDoenSai.com athlete-owned Highlight uploads.
-- The bucket is private. Media is served only to its owner, an admin, or when
-- the athlete has explicitly made the profile public.

begin;

create table if not exists public.athlete_highlights (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  media_path text not null unique,
  media_type text not null check (media_type in ('image', 'video')),
  created_at timestamptz not null default now()
);

create index if not exists athlete_highlights_athlete_created_idx
  on public.athlete_highlights (athlete_id, created_at desc);

alter table public.athlete_highlights enable row level security;

drop policy if exists "athlete_highlights_public_or_owner_select" on public.athlete_highlights;
create policy "athlete_highlights_public_or_owner_select"
on public.athlete_highlights for select to anon, authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_admin())
  or exists (
    select 1 from public.athlete_profiles p
    where p.user_id = athlete_highlights.athlete_id and p.is_public
  )
);

drop policy if exists "athlete_highlights_owner_write" on public.athlete_highlights;
create policy "athlete_highlights_owner_write"
on public.athlete_highlights for all to authenticated
using (athlete_id = (select auth.uid()) or (select public.is_admin()))
with check (athlete_id = (select auth.uid()) or (select public.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'athlete-highlights',
  'athlete-highlights',
  false,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "athlete_highlights_owner_insert" on storage.objects;
create policy "athlete_highlights_owner_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'athlete-highlights'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "athlete_highlights_owner_delete" on storage.objects;
create policy "athlete_highlights_owner_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'athlete-highlights'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
);

drop policy if exists "athlete_highlights_owner_or_public_profile_read" on storage.objects;
create policy "athlete_highlights_owner_or_public_profile_read"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'athlete-highlights'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.is_admin())
    or exists (
      select 1 from public.athlete_profiles p
      where p.user_id::text = (storage.foldername(name))[1] and p.is_public
    )
  )
);

commit;
