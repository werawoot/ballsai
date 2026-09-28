-- 44-venue-photo-storage-policy-fix-v1.sql
-- Repairs SQL43's owner policies on storage.objects for Supabase project
-- hivedzrwrrcnjrlirhtv. SQL43 resolves the unqualified `name` inside each
-- venue_profiles subquery as v.name, the venue's name, not the object path. The
-- insert, read and delete policies all have it, so a venue owner can neither upload,
-- read (the signed preview) nor delete their own photo objects; admins are unaffected.
-- Each policy here names storage.objects.name explicitly.
-- Reproduced on a sandbox Postgres 28 Sep 2026: before, the owner uploaded nothing,
-- saw 0 of their objects and deleted 0; after, all three worked for the owner and
-- another user was refused all three.
-- Apply only after explicit owner approval. This migration changes no object,
-- venue photo row, bucket configuration, or privilege grant.

begin;

do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'venue-photos' and public = false
  ) then
    raise exception 'SQL44 requires the private venue-photos bucket from SQL43';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'venue_photos_owner_insert'
      and cmd = 'INSERT'
  ) then
    raise exception 'SQL44 requires the SQL43 venue_photos_owner_insert policy';
  end if;

  if (select count(*) from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname in ('venue_photos_owner_or_admin_read', 'venue_photos_owner_or_admin_delete')) <> 2 then
    raise exception 'SQL44 requires the SQL43 read and delete policies';
  end if;
end;
$$;

drop policy if exists venue_photos_owner_insert on storage.objects;

create policy venue_photos_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'venue-photos'
  and storage.objects.name ~ (
    '^' || ((storage.foldername(storage.objects.name))[1]) ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  )
  and exists (
    select 1
    from public.venue_profiles v
    where v.id = ((storage.foldername(storage.objects.name))[1])::uuid
      and v.owner_id = (select auth.uid())
  )
);

drop policy if exists venue_photos_owner_or_admin_read on storage.objects;

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
      where v.id = ((storage.foldername(storage.objects.name))[1])::uuid
        and v.owner_id = (select auth.uid())
    )
  )
);

drop policy if exists venue_photos_owner_or_admin_delete on storage.objects;

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
      where v.id = ((storage.foldername(storage.objects.name))[1])::uuid
        and v.owner_id = (select auth.uid())
    )
  )
);

do $$
declare
  v_wrong text;
begin
  -- pg_policies holds the deparsed expression, in which Postgres writes the column as
  -- objects.name: `storage.foldername(objects.name)`. Compare against that stored text,
  -- never the source spelling `storage.objects.name`, which never appears there.
  select string_agg(policyname, ', ') into v_wrong
  from (values ('venue_photos_owner_insert'), ('venue_photos_owner_or_admin_read'),
               ('venue_photos_owner_or_admin_delete')) as expected(policyname)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname = 'storage' and p.tablename = 'objects'
      and p.policyname = expected.policyname
      and (coalesce(p.qual, '') || coalesce(p.with_check, '')) like '%foldername(objects.name)%'
      and (coalesce(p.qual, '') || coalesce(p.with_check, '')) not like '%foldername(v.name)%'
  );

  if v_wrong is not null then
    raise exception 'SQL44 failed to bind the venue-photo path to storage.objects.name for: %', v_wrong;
  end if;
end;
$$;

commit;
