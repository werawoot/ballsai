-- Read-only precheck for SQL62. Check the project ref in the URL first:
-- Staging vorpnkedpscsqhnrssrl before Production hivedzrwrrcnjrlirhtv.

select (select public from storage.buckets where id = 'athlete-avatars') as bucket_public_now,
       to_regprocedure('storage.allow_any_operation(text[])') is not null as storage_helper_present,
       to_regprocedure('public.is_admin()') is not null as is_admin_present;
-- Expected: true (or false if already applied), true, true. If storage_helper_present is
-- false, STOP: the policy cannot refuse a bucket listing without it.

-- The read policies on the bucket today. Save this output: it is what a rollback restores
-- (sql/rollback/62-private-athlete-avatars-down.sql).
select policyname, roles, cmd, qual
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (qual like '%athlete-avatars%' or with_check like '%athlete-avatars%')
order by policyname;
-- Expected before SQL62: athlete_avatars_public_read (select, anon/authenticated) and the
-- owner insert/update/delete policies from sql/athlete-profile-v2.sql.

-- The exposure SQL62 closes: photos readable today although the profile is not public,
-- and old photos no profile points at any more.
select count(*) filter (where p.user_id is null or not p.is_public) as photos_of_non_public_profiles,
       count(*) filter (where p.is_public
         and p.profile_image_url is distinct from o.name
         and coalesce(right(p.profile_image_url, length('/storage/v1/object/public/athlete-avatars/' || o.name)), '')
             <> '/storage/v1/object/public/athlete-avatars/' || o.name) as old_photos_of_public_profiles,
       count(*) as all_photos
from storage.objects o
left join public.athlete_profiles p on p.user_id::text = (storage.foldername(o.name))[1]
where o.bucket_id = 'athlete-avatars';
-- Information only. After SQL62 neither of the first two can be read by anyone but the
-- owner and an admin.

-- How the photo is stored: an object path (app after T51) or an older public URL. Both work.
select count(*) filter (where profile_image_url like 'http%') as stored_as_public_url,
       count(*) filter (where profile_image_url is not null and profile_image_url not like 'http%') as stored_as_path
from public.athlete_profiles;
