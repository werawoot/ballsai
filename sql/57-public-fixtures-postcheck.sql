-- Read-only postcheck for SQL57. Check the project ref in the URL first.

select has_function_privilege('anon', 'public.public_tournament_fixtures(uuid)', 'EXECUTE') as public_can_read,
       has_function_privilege('anon', 'public.set_fixtures_published_safely(uuid, boolean)', 'EXECUTE') as public_can_publish,
       (select count(*) from public.tournaments where fixtures_published_at is not null) as published_now;
-- Expected: true, false, 0 right after applying.

-- Then on the site: /tournaments/<id>/fixtures signed out says the draw is not published;
-- the organizer switches "เผยแพร่ตาราง" on /dashboard/tournaments/<id>/fixtures; signed out,
-- the page now shows the fixtures and tables; switching it off hides them again.
