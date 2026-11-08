-- Rollback for SQL95, same project, owner approval only. LOSES every athlete's training goals
-- (which goal and since when). Training itself (SQL63) is not touched. Without the table the
-- app hides the goal step and suggests programmes by age only.

begin;
drop function if exists public.set_my_training_goal(text);
drop table if exists public.athlete_training_goals;
commit;
