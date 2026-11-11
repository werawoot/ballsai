-- Rollback for SQL96, same project, owner approval only. LOSES every athlete's self-test
-- results (juggling, plank, long jump numbers and their days). Training (SQL63) and goals
-- (SQL95) are not touched. Without the table the app hides the self-test pages.

begin;
drop function if exists public.record_my_self_test(text, integer);
drop function if exists public.delete_my_self_test(text, date);
drop table if exists public.athlete_self_tests;
commit;
