-- BallDoenSai.com highlight moderation V1
-- Apply after sql/athlete-highlight-uploads-v1.sql. Safe to re-run.
--
-- Why this exists: athletes upload images and video up to 25 MB and share their public
-- profile, but there was no report path, no review queue, and no way for an admin to take
-- a clip down other than deleting the storage object by hand. The users are children, so
-- a takedown must be immediate, reversible, and must not destroy the athlete's file.
--
-- Hiding is the default action: moderation_status flips to 'hidden' and the clip stops
-- being readable by anyone except its owner and an admin. Deleting stays available for
-- content that must not remain stored at all.

begin;

alter table public.athlete_highlights
  add column if not exists moderation_status text not null default 'visible'
    check (moderation_status in ('visible', 'hidden')),
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references auth.users(id) on delete set null;

create table if not exists public.athlete_highlight_reports (
  id bigint generated always as identity primary key,
  highlight_id bigint not null references public.athlete_highlights(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 400),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  -- One report per person per clip. Repeat reports add no information and would let a
  -- single account bury a clip in the queue.
  unique (highlight_id, reporter_id)
);

create index if not exists athlete_highlight_reports_open_idx
  on public.athlete_highlight_reports (created_at desc)
  where resolved_at is null;
create index if not exists athlete_highlight_reports_highlight_idx
  on public.athlete_highlight_reports (highlight_id);
create index if not exists athlete_highlights_hidden_idx
  on public.athlete_highlights (moderation_status, created_at desc);

alter table public.athlete_highlight_reports enable row level security;

drop policy if exists "highlight_reports_reporter_insert" on public.athlete_highlight_reports;
create policy "highlight_reports_reporter_insert"
on public.athlete_highlight_reports for insert to authenticated
with check (reporter_id = (select auth.uid()));

drop policy if exists "highlight_reports_reporter_or_admin_select" on public.athlete_highlight_reports;
create policy "highlight_reports_reporter_or_admin_select"
on public.athlete_highlight_reports for select to authenticated
using (reporter_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "highlight_reports_admin_update" on public.athlete_highlight_reports;
create policy "highlight_reports_admin_update"
on public.athlete_highlight_reports for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "highlight_reports_admin_delete" on public.athlete_highlight_reports;
create policy "highlight_reports_admin_delete"
on public.athlete_highlight_reports for delete to authenticated
using ((select public.is_admin()));

-- A hidden clip disappears for everyone but its owner and an admin. Replaces the policy
-- from sql/athlete-highlight-uploads-v1.sql, which only checked profile visibility.
drop policy if exists "athlete_highlights_public_or_owner_select" on public.athlete_highlights;
create policy "athlete_highlights_public_or_owner_select"
on public.athlete_highlights for select to anon, authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_admin())
  or (
    moderation_status = 'visible'
    and exists (
      select 1 from public.athlete_profiles p
      where p.user_id = athlete_highlights.athlete_id and p.is_public
    )
  )
);

-- The storage object must follow the row, otherwise a hidden clip would still be
-- readable by anyone who already knows its object path.
drop policy if exists "athlete_highlights_owner_or_public_profile_read" on storage.objects;
create policy "athlete_highlights_owner_or_public_profile_read"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'athlete-highlights'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.is_admin())
    or exists (
      select 1
      from public.athlete_highlights h
      join public.athlete_profiles p on p.user_id = h.athlete_id
      where h.media_path = storage.objects.name
        and h.moderation_status = 'visible'
        and p.is_public
    )
  )
);

commit;
