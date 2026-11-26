#!/usr/bin/env bash
# Sandbox only for SQL105: two things at the same moment, against a local database that has the
# SQL105 chain (sql/checks/105-sandbox-base.sql lists it). Never run on Staging or Production.
# Usage: sql/checks/105-sandbox-concurrency.sh "<psql connection args>"   e.g. "-p 54398 -d d105"
# Each case runs ROUNDS times; two sessions start together and each holds its transaction open for
# a moment, so the second must wait on the first. Prints one line per case: ok N/N or the failures.
set -u
PSQL="psql -X -q -t -A $1"
ROUNDS=${ROUNDS:-20}
F1=00000000-0000-4000-8000-0000000000f1
C1=00000000-0000-4000-8000-0000000000c1
A1=00000000-0000-4000-8000-0000000000a1
as() { echo "select set_config('request.jwt.claim.sub', '$1', false); set role authenticated;"; }

resend_ok=0; race_ok=0
for round in $(seq 1 "$ROUNDS"); do
  T=00000000-0000-4000-8000-$(printf '%012d' $((900000 + round)))
  P=00000000-0000-4000-8000-$(printf '%012d' $((910000 + round)))
  $PSQL >/dev/null <<SQL
delete from public.payments where team_id = '$T'; delete from public.teams where id = '$T';
delete from storage.objects where name like '${C1}_${round}_%';
insert into public.teams (id, name, tournament_id, created_by, status) values ('$T', 'race $round', '$F1', '$C1', 'pending');
insert into storage.objects (bucket_id, name, owner_id) values ('slips', '${C1}_${round}_a.png', '$C1'), ('slips', '${C1}_${round}_b.png', '$C1'), ('slips', '${C1}_${round}_0.png', '$C1');
insert into public.payments (id, team_id, tournament_id, user_id, amount, promptpay, slip_url, status, rejection_reason, rejected_at)
  values ('$P', '$T', '$F1', '$C1', 500, '0812345678', '${C1}_${round}_0.png', 'rejected', 'ยอดไม่ครบ', now());
SQL
  # Case 1: the coach sends a new slip twice at once (a double tap, two tabs).
  for slip in a b; do
    $PSQL >/dev/null 2>&1 <<SQL &
$(as $C1)
begin;
insert into public.payments (team_id, tournament_id, user_id, amount, promptpay, slip_url, status)
  values ('$T', '$F1', '$C1', 500, '0812345678', '${C1}_${round}_${slip}.png', 'pending');
select pg_sleep(0.3);
commit;
SQL
  done
  wait
  open=$($PSQL -c "select count(1) from public.payments where team_id = '$T' and status <> 'rejected'")
  [ "$open" = "1" ] && resend_ok=$((resend_ok + 1)) || echo "round $round: $open open payments after two resends"

  # Case 2: the organizer rejects and confirms the same open slip at once (two tabs).
  OPEN=$($PSQL -c "select id from public.payments where team_id = '$T' and status = 'pending'")
  $PSQL >/dev/null 2>&1 <<SQL &
$(as $A1)
begin; select public.reject_payment_safely('$OPEN', 'ภาพไม่ชัด'); select pg_sleep(0.3); commit;
SQL
  $PSQL >/dev/null 2>&1 <<SQL &
$(as $A1)
begin; select public.confirm_payment_safely('$OPEN'); select pg_sleep(0.3); commit;
SQL
  wait
  state=$($PSQL -c "select p.status || '/' || t.status from public.payments p join public.teams t on t.id = p.team_id where p.id = '$OPEN'")
  case "$state" in
    rejected/pending|confirmed/confirmed) race_ok=$((race_ok + 1)) ;;
    *) echo "round $round: payment/team ended $state" ;;
  esac
  $PSQL >/dev/null -c "delete from public.payments where team_id = '$T'; delete from public.teams where id = '$T'; delete from storage.objects where name like '${C1}_${round}_%';"
done
echo "two resends at once leave one open payment: ok $resend_ok/$ROUNDS"
echo "reject and confirm at once end in one of the two, team matching: ok $race_ok/$ROUNDS"
