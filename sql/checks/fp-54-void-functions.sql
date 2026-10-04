-- Read-only fingerprint of the function bodies of SQL54 and match-result-void, for checking
-- a hand-typed apply. Comments and all whitespace are stripped first. Expected (computed
-- from the files in the repo on 4 Oct 2026, same method as fp-46/fp-47):
--   notify_venue_booking_responded  56c17d2c0db094a02989eedb6d9b2a78   (sql/54-venue-cancel-notification-fix-v1.sql)
--   void_match_result_safely        0de68ddffacc9785512545c8444ac0d1   (sql/match-result-void-v1.sql)

select proname,
       md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as fp
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('notify_venue_booking_responded', 'void_match_result_safely')
order by proname;
