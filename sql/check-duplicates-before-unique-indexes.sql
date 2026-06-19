-- Run this before applying unique indexes in sql/supabase-rls.sql
-- If any query returns rows, clean them up before creating the indexes.

-- Duplicate team registrations by the same user in the same tournament
select
  tournament_id,
  created_by,
  count(*) as duplicate_count,
  array_agg(id order by id) as team_ids
from public.teams
group by tournament_id, created_by
having count(*) > 1;

-- Duplicate payments for the same team
select
  team_id,
  count(*) as duplicate_count,
  array_agg(id order by id) as payment_ids
from public.payments
group by team_id
having count(*) > 1;

-- Optional: duplicate storage object names inside slips bucket
select
  name,
  count(*) as duplicate_count
from storage.objects
where bucket_id = 'slips'
group by name
having count(*) > 1;
