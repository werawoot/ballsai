-- 45-venue-photo-public-delivery-v1.sql
-- Public delivery for moderation-approved venue photos.
-- Apply only to Supabase project hivedzrwrrcnjrlirhtv after explicit owner approval.
--
-- What this does and does not do:
--   * The venue-photos bucket stays PRIVATE. This file never sets public = true.
--   * It adds one narrow SELECT policy on storage.objects so an anonymous visitor can
--     have a short-lived signed URL minted for an object whose photo row is 'visible'
--     and whose venue is published. Nothing else becomes readable.
--   * Pending and hidden photos, and photos of unpublished venues, stay unreachable.
--   * It creates no table, function, grant, bucket or object, and it does not touch any
--     policy created by SQL43 or SQL44. The only object it drops is its own policy, so a
--     re-run is idempotent.
--
-- Operational limit, per docs/research/venue-photo-public-delivery-2026-09-17.md: a
-- signed URL stays usable until it expires and Smart CDN may serve a cached response
-- past that point. This is public application behaviour, not a secret-keeping boundary.
-- Withdrawing an approved photo means hiding the row AND deleting the object.

begin;

do $$
begin
  if to_regclass('public.venue_photos') is null then
    raise exception 'SQL45 requires public.venue_photos from SQL43';
  end if;
  if to_regclass('public.venue_profiles') is null then
    raise exception 'SQL45 requires public.venue_profiles from SQL23';
  end if;
  if not exists (select 1 from storage.buckets where id = 'venue-photos') then
    raise exception 'SQL45 requires the venue-photos bucket from SQL43';
  end if;
  -- Refuse to widen access to a bucket someone has already made public: that would be a
  -- different and much larger exposure than this migration is reviewed for.
  if not exists (select 1 from storage.buckets where id = 'venue-photos' and public = false) then
    raise exception 'SQL45 expects venue-photos to still be private; stop and reconcile state';
  end if;
  -- The policy must allow retrieving one object while still refusing a bucket listing.
  -- The documented way to express that is storage.allow_any_operation(text[]), naming the
  -- retrieval operations explicitly. Without the helper the predicate cannot express it,
  -- and a bucket-listing hole is not an acceptable fallback.
  if to_regprocedure('storage.allow_any_operation(text[])') is null then
    raise exception 'SQL45 requires storage.allow_any_operation(text[]); upgrade Storage or re-review the policy';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'venue_photos_owner_or_admin_read'
  ) then
    raise exception 'SQL45 requires SQL43 owner/admin object read policy to already exist';
  end if;
end;
$$;

drop policy if exists venue_photos_public_object_read on storage.objects;

-- Five conditions, all required:
--   1. the object is in the venue-photos bucket;
--   2. the Storage operation is one of the two object-retrieval operations, so a bucket
--      or prefix listing matches nothing;
--   3. the object name is exactly <venue-id>/<file>, which pins the stored path shape;
--   4. a venue_photos row registers this exact stored path and is 'visible'; and
--   5. that row's venue is published.
-- Owner and admin access to non-visible photos stays entirely in SQL43's separate
-- policies; this one adds nothing for them beyond what they already have.
create policy venue_photos_public_object_read
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'venue-photos'
  and storage.allow_any_operation(
    array['object.get_authenticated_info', 'object.get_authenticated']
  )
  and array_length(storage.foldername(storage.objects.name), 1) = 1
  and exists (
    select 1
    from public.venue_photos p
    join public.venue_profiles v on v.id = p.venue_id
    where p.object_path = storage.objects.name
      and p.moderation_status = 'visible'
      and v.is_published
  )
);

commit;
