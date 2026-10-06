-- Read-only fingerprint of SQL46's five function bodies, for checking a hand-typed apply.
-- Comments and all whitespace are stripped first, so only a real change to the code moves
-- a value. Expected (computed from sql/46-venue-beta-operations-v1.sql, checked on
-- Postgres 16 on 4 Oct 2026):
--   coordinate_venue_booking_beta   fdafa06ff1308840d04fbb29b9b50594
--   guard_venue_slot_overlap_beta   bb01e7ce43bf30ab8746eec40773d127
--   manage_venue_beta               f08c3e576bdf9a24033dcfbf2d0165d3
--   venue_booking_options_beta      55bf5aedde7281235cb98deb5f63a592
--   venue_booking_participant_beta  a959be3b292571d80d827b8e84600b5d

select proname,
       md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as fp
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('guard_venue_slot_overlap_beta', 'manage_venue_beta', 'venue_booking_participant_beta',
                  'coordinate_venue_booking_beta', 'venue_booking_options_beta')
order by proname;
