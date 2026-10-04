-- Read-only fingerprint of SQL47's six function bodies, for checking a hand-typed apply.
-- Comments and all whitespace are stripped first, so only a real change to the code moves
-- a value. Expected (computed from sql/47-coach-beta-management-v1.sql, checked on
-- Postgres 16 on 4 Oct 2026):
--   attest_coach_claim_beta              1c1fe33427d56435145adcb373fb93a7
--   delete_my_athlete_data               a9697282e2fb6d145f2ed13c5ec585e5
--   is_team_creator_beta                 9150323e5ad94514c341cf595ddecbbf
--   manage_coach_beta                    99c697e3e8e6fe4b0961716c43c42185
--   prevent_data_trust_history_mutation  6120719519e69e41f64216dee06992de
--   respond_coach_attestation_beta       49bf9c2dfe26324b595f6f26999fd0b4

select proname,
       md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as fp
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('attest_coach_claim_beta', 'delete_my_athlete_data', 'is_team_creator_beta',
                  'manage_coach_beta', 'prevent_data_trust_history_mutation', 'respond_coach_attestation_beta')
order by proname;
