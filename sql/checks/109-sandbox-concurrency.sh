#!/usr/bin/env bash
# Sandbox only for SQL109: twenty adds of the same account and day at once, from a count of 8, must
# stop at 10. Against a local database with the SQL108 chain and SQL109. Never Staging or Production.
# Usage: sql/checks/109-sandbox-concurrency.sh "<psql connection args>"   e.g. "-p 54398 -d d108"
set -u
PSQL="psql -X -q -t -A $1"
U=00000000-0000-4000-8000-000000000077
ROUNDS=${ROUNDS:-10}
ok=0
for round in $(seq 1 "$ROUNDS"); do
  D=$(date -u -d "-$round days" +%F)
  $PSQL -c "delete from public.run_logs where user_id = '$U' and run_date = '$D'; insert into public.run_logs (user_id, request_id, run_date, distance_m, duration_s) select '$U', gen_random_uuid(), '$D', 3000, 1200 from generate_series(1, 8);" >/dev/null
  for i in $(seq 1 20); do
    $PSQL >/dev/null 2>&1 <<SQL &
select set_config('request.jwt.claim.sub', '$U', false); set role authenticated;
begin; select public.add_my_run(gen_random_uuid(), '$D', 3000, 1200); select pg_sleep(0.05); commit;
SQL
  done
  wait
  n=$($PSQL -c "select count(1) from public.run_logs where user_id = '$U' and run_date = '$D'")
  [ "$n" = "10" ] && ok=$((ok + 1)) || echo "round $round: $n runs on one day"
done
$PSQL -c "delete from public.run_logs where user_id = '$U'" >/dev/null
echo "twenty adds at once from 8 stop at 10: ok $ok/$ROUNDS"
