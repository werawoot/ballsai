-- 43-venue-photos-v1.sql
-- Venue images for BallDoenSai closed beta.
-- Apply only to Supabase project hivedzrwrrcnjrlirhtv after explicit owner approval.
-- This migration creates a private bucket. It does not make any image public.

begin;

do $$
begin
  if to_regclass('public.venue_profiles') is null then
    raise exception 'SQL43 requires public.venue_profiles from SQL23';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'SQL43 requires public.is_admin()';
  end if;
  if to_regprocedure('audit.write_admin_event(text, text, text, text, jsonb, jsonb)') is null then
    raise exception 'SQL43 requires the SQL35 admin audit entry point';
  end if;
  if exists (select 1 from storage.buckets where id = 'venue-photos') then
    raise exception 'SQL43 venue-photos bucket already exists; stop and reconcile state';
  end if;
end;
$$;

create table public.venue_photos (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venue_profiles(id) on delete cascade,
  object_path text not null check (char_length(object_path) between 1 and 400),
  caption text not null default '' check (char_length(caption) <= 160),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_cover boolean not null default false,
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'visible', 'hidden')),
  hidden_at timestamptz,
  hidden_by uuid references public.profiles(id) on delete set null,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (venue_id, object_path)
);

create unique index venue_photos_one_cover_idx
  on public.venue_photos (venue_id)
  where is_cover;

create index venue_photos_venue_order_idx
  on public.venue_photos (venue_id, sort_order, created_at);

create index venue_photos_moderation_queue_idx
  on public.venue_photos (moderation_status, created_at desc);

alter table public.venue_photos enable row level security;

create policy venue_photos_select_visible_or_owner_or_admin
on public.venue_photos
for select
to anon, authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.venue_profiles v
    where v.id = venue_photos.venue_id
      and v.owner_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.venue_profiles v
    where v.id = venue_photos.venue_id
      and v.is_published
      and venue_photos.moderation_status = 'visible'
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'venue-photos',
  'venue-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

create policy venue_photos_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'venue-photos'
  and name ~ (
    '^' || ((storage.foldername(name))[1]) ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  )
  and exists (
    select 1
    from public.venue_profiles v
    where v.id = ((storage.foldername(name))[1])::uuid
      and v.owner_id = (select auth.uid())
  )
);

create policy venue_photos_owner_or_admin_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'venue-photos'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.venue_profiles v
      where v.id = ((storage.foldername(name))[1])::uuid
        and v.owner_id = (select auth.uid())
    )
  )
);

create policy venue_photos_owner_or_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'venue-photos'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.venue_profiles v
      where v.id = ((storage.foldername(name))[1])::uuid
        and v.owner_id = (select auth.uid())
    )
  )
);

-- All venue photo mutations go through these functions. Table RLS remains read-only
-- so that an owner cannot set a pending image visible by changing a column directly.
create or replace function public.add_venue_photo_safely(
  p_venue_id uuid,
  p_object_path text,
  p_caption text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_owner_id uuid;
  v_photo_id uuid;
  v_sort_order integer;
  v_is_first boolean;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_caption is null or char_length(p_caption) > 160 then
    raise exception 'INVALID_CAPTION' using errcode = '22023';
  end if;
  if p_object_path is null
     or p_object_path !~ ('^' || p_venue_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$') then
    raise exception 'INVALID_VENUE_PHOTO_PATH' using errcode = '22023';
  end if;

  -- Serialise additions per venue so the eight-image cap and the first-cover rule
  -- remain correct when two browser requests arrive together.
  select owner_id into v_owner_id
  from public.venue_profiles
  where id = p_venue_id
  for update;

  if v_owner_id is null then
    raise exception 'VENUE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_owner_id <> v_actor then
    raise exception 'VENUE_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'venue-photos' and name = p_object_path
  ) then
    raise exception 'VENUE_PHOTO_OBJECT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if (select count(*) from public.venue_photos where venue_id = p_venue_id) >= 8 then
    raise exception 'VENUE_PHOTO_LIMIT_REACHED' using errcode = '22023';
  end if;

  select coalesce(max(sort_order), -1) + 1, count(*) = 0
    into v_sort_order, v_is_first
  from public.venue_photos
  where venue_id = p_venue_id;

  insert into public.venue_photos (
    venue_id, object_path, caption, sort_order, is_cover, uploaded_by
  ) values (
    p_venue_id, p_object_path, p_caption, v_sort_order, v_is_first, v_actor
  ) returning id into v_photo_id;

  return v_photo_id;
end;
$$;

create or replace function public.set_venue_photo_cover_safely(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_owner_id uuid;
  v_venue_id uuid;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select p.venue_id, v.owner_id into v_venue_id, v_owner_id
  from public.venue_photos p
  join public.venue_profiles v on v.id = p.venue_id
  where p.id = p_photo_id;
  if v_owner_id is null then
    raise exception 'VENUE_PHOTO_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_owner_id <> v_actor then
    raise exception 'VENUE_OWNER_REQUIRED' using errcode = '42501';
  end if;
  perform 1 from public.venue_profiles where id = v_venue_id for update;
  update public.venue_photos set is_cover = false where venue_id = v_venue_id and is_cover;
  update public.venue_photos set is_cover = true where id = p_photo_id;
end;
$$;

create or replace function public.reorder_venue_photos_safely(p_photo_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_venue_id uuid;
  v_owner_id uuid;
  v_count integer;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  v_count := cardinality(p_photo_ids);
  if v_count is null or v_count = 0 or v_count > 8 then
    raise exception 'INVALID_VENUE_PHOTO_ORDER' using errcode = '22023';
  end if;
  select p.venue_id, v.owner_id into v_venue_id, v_owner_id
  from public.venue_photos p
  join public.venue_profiles v on v.id = p.venue_id
  where p.id = p_photo_ids[1];
  if v_owner_id is null then
    raise exception 'VENUE_PHOTO_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_owner_id <> v_actor then
    raise exception 'VENUE_OWNER_REQUIRED' using errcode = '42501';
  end if;
  perform 1 from public.venue_profiles where id = v_venue_id for update;
  if (select count(*) from public.venue_photos where venue_id = v_venue_id and id = any(p_photo_ids)) <> v_count
     or (select count(distinct photo_id) from unnest(p_photo_ids) as photo_id) <> v_count then
    raise exception 'INVALID_VENUE_PHOTO_ORDER' using errcode = '22023';
  end if;
  update public.venue_photos p
  set sort_order = ordered.ordinality - 1
  from unnest(p_photo_ids) with ordinality as ordered(photo_id, ordinality)
  where p.id = ordered.photo_id;
end;
$$;

create or replace function public.remove_venue_photo_safely(p_photo_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_owner_id uuid;
  v_venue_id uuid;
  v_object_path text;
  v_was_cover boolean;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select p.venue_id, v.owner_id, p.object_path, p.is_cover
    into v_venue_id, v_owner_id, v_object_path, v_was_cover
  from public.venue_photos p
  join public.venue_profiles v on v.id = p.venue_id
  where p.id = p_photo_id;
  if v_owner_id is null then
    raise exception 'VENUE_PHOTO_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_owner_id <> v_actor then
    raise exception 'VENUE_OWNER_REQUIRED' using errcode = '42501';
  end if;
  perform 1 from public.venue_profiles where id = v_venue_id for update;
  delete from public.venue_photos where id = p_photo_id;
  if v_was_cover then
    update public.venue_photos
    set is_cover = true
    where id = (
      select id from public.venue_photos
      where venue_id = v_venue_id
      order by sort_order, created_at, id
      limit 1
    );
  end if;
  return v_object_path;
end;
$$;

create or replace function public.moderate_venue_photo_safely(p_photo_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_before text;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_status not in ('visible', 'hidden') then
    raise exception 'INVALID_MODERATION_STATUS' using errcode = '22023';
  end if;
  select moderation_status into v_before
  from public.venue_photos
  where id = p_photo_id
  for update;
  if v_before is null then
    raise exception 'VENUE_PHOTO_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.venue_photos
  set moderation_status = p_status,
      hidden_at = case when p_status = 'hidden' then now() else null end,
      hidden_by = case when p_status = 'hidden' then v_actor else null end
  where id = p_photo_id;
  perform audit.write_admin_event(
    'venue.photo.moderate',
    'venue_photo',
    p_photo_id::text,
    'เปลี่ยนสถานะรูปสนาม',
    jsonb_build_object('moderation_status', v_before),
    jsonb_build_object('moderation_status', p_status)
  );
end;
$$;

revoke all on table public.venue_photos from anon, authenticated, service_role;
grant select on table public.venue_photos to anon, authenticated;

revoke all on function public.add_venue_photo_safely(uuid, text, text) from public, anon, service_role;
revoke all on function public.set_venue_photo_cover_safely(uuid) from public, anon, service_role;
revoke all on function public.reorder_venue_photos_safely(uuid[]) from public, anon, service_role;
revoke all on function public.remove_venue_photo_safely(uuid) from public, anon, service_role;
revoke all on function public.moderate_venue_photo_safely(uuid, text) from public, anon, service_role;

grant execute on function public.add_venue_photo_safely(uuid, text, text) to authenticated;
grant execute on function public.set_venue_photo_cover_safely(uuid) to authenticated;
grant execute on function public.reorder_venue_photos_safely(uuid[]) to authenticated;
grant execute on function public.remove_venue_photo_safely(uuid) to authenticated;
grant execute on function public.moderate_venue_photo_safely(uuid, text) to authenticated;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.add_venue_photo_safely(uuid,text,text)',
    'public.set_venue_photo_cover_safely(uuid)',
    'public.reorder_venue_photos_safely(uuid[])',
    'public.remove_venue_photo_safely(uuid)',
    'public.moderate_venue_photo_safely(uuid,text)'
  ] loop
    if has_function_privilege('anon', v_signature, 'execute')
       or has_function_privilege('service_role', v_signature, 'execute')
       or not has_function_privilege('authenticated', v_signature, 'execute') then
      raise exception 'SQL43 privilege verification failed for %', v_signature;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.venue_photos', 'insert')
     or has_table_privilege('authenticated', 'public.venue_photos', 'update')
     or has_table_privilege('authenticated', 'public.venue_photos', 'delete') then
    raise exception 'SQL43 venue_photos direct mutation privilege verification failed';
  end if;
end;
$$;

commit;
