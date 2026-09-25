-- 44-venue-photo-storage-policy-fix-v1.sql
-- Repairs SQL43's upload policy on Supabase project hivedzrwrrcnjrlirhtv.
-- SQL43 accidentally resolves the unqualified `name` inside its venue_profiles
-- subquery as v.name. This policy must instead inspect storage.objects.name.
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

do $$
declare
  v_with_check text;
begin
  select with_check into v_with_check
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'venue_photos_owner_insert';

  if v_with_check is null
     or v_with_check not like '%storage.foldername(storage.objects.name)%'
     or v_with_check like '%storage.foldername(v.name)%' then
    raise exception 'SQL44 failed to bind the venue-photo path to storage.objects.name';
  end if;
end;
$$;

commit;
