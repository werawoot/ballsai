-- Read-only postcheck for SQL62. Check the project ref in the URL first.

select (select public from storage.buckets where id = 'athlete-avatars') as bucket_public,
       exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
               and policyname = 'athlete_avatars_public_read') as old_public_read_left,
       exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
               and policyname = 'athlete_avatars_owner_or_admin_read') as owner_read_present,
       exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
               and policyname = 'athlete_avatars_public_profile_sign'
               and qual like '%allow_any_operation%' and qual like '%is_public%') as public_sign_present;
-- Expected: false, false, true, true.

-- What a signed-out visitor can do, simulated inside a transaction that is rolled back.
-- Signing: only the current photo of a public profile. Listing: nothing.
begin;
select set_config('storage.operation', 'storage.object.sign_many', true);
set local role anon;
select count(*) as anon_can_sign from storage.objects where bucket_id = 'athlete-avatars';
select set_config('storage.operation', 'storage.object.list', true);
select count(*) as anon_can_list from storage.objects where bucket_id = 'athlete-avatars';
rollback;
-- Expected: anon_can_sign = the number of public profiles that have a photo; anon_can_list = 0.
select count(*) as public_profiles_with_photo
from public.athlete_profiles where is_public and profile_image_url is not null;
-- anon_can_sign should equal this (lower only if a stored photo was deleted from storage).

-- Then in the app (Staging): open /athletes and a public /players/<id> signed out: photos
-- show. Copy a photo's old public URL (…/object/public/athlete-avatars/…) into a private
-- window: it no longer loads. A private profile's photo shows only to its owner on /profile.
