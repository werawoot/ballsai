-- Read-only precheck for SQL80. Read the Project ID in Settings > General first.
-- Expected on Production (16 Oct 2026): payments_table true, unique_index false,
-- teams_with_two_payments 0. On Staging unique_index is already true (SQL80 changes nothing).
-- If teams_with_two_payments is above 0, stop: those payments need a human decision first.
-- team_registration_index is for the record: the other unique index of step 3.

select to_regclass('public.payments') is not null as payments_table,
       to_regclass('public.payments_one_payment_per_team_idx') is not null as unique_index,
       (select count(1) from (select team_id from public.payments where team_id is not null group by team_id having count(1) > 1) d) as teams_with_two_payments,
       (select count(1) from public.payments) as payments,
       to_regclass('public.teams_one_registration_per_user_per_tournament_idx') is not null as team_registration_index;
