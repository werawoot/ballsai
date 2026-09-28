-- Read-only postcheck for SQL58. Check the project ref in the URL first.

select has_column_privilege('anon', 'public.athlete_profiles', 'birth_date', 'SELECT') as anon_birth_date,
       has_column_privilege('authenticated', 'public.athlete_profiles', 'birth_date', 'SELECT') as signed_in_birth_date,
       has_column_privilege('anon', 'public.athlete_profiles', 'guardian_consent_at', 'SELECT') as anon_consent,
       has_column_privilege('anon', 'public.athlete_profiles', 'display_name', 'SELECT') as anon_display_name,
       has_column_privilege('authenticated', 'public.athlete_profiles', 'birth_date', 'UPDATE') as athlete_can_save_birth_date,
       has_function_privilege('anon', 'public.public_athlete_age(uuid)', 'EXECUTE') as anon_age,
       has_function_privilege('anon', 'public.my_athlete_private()', 'EXECUTE') as anon_private;
-- Expected: false, false, false, true, true, true, false.

select count(*) as public_athletes, count(age) as with_age from public.public_athlete_directory;
-- Expected: the two numbers are equal (a public profile always has a birth date).

-- Then on the site: signed out, /athletes shows ages and the U12/U15/U18/adult filters
-- work; /ranking ดาวรุ่ง lists under-18 athletes; /players/<a public athlete> shows the
-- age. Signed in as a test athlete, /profile shows the saved birth date, and saving the
-- form (name, birth date) succeeds. Then run npm run security:rls: the two
-- "birth date"/"guardian consent" checks now pass.
