# Match Plan V1 — Coach pre-match workspace

Status: prepared in the worktree on 19 August 2026. It is **not live** until SQL
step 28 is applied to Supabase project `hivedzrwrrcnjrlirhtv` and the application is deployed.

## What it does

1. A coach, tournament organizer, or admin opens `/match-plan`.
2. They choose a tournament-scoped team that they manage.
3. The page loads **only** `team_members.status = accepted` for that team.
4. The coach marks accepted athletes as starter or substitute, picks a match-plan
   position (`GK`, `DF`, `MF`, `FW`), chooses a formation, and adds Match Focus / Team Talk.
5. Saving writes a private match-plan record through `save_match_plan_safely()`.

This is deliberately not a match sheet or result entry. It does not create a
`match_results` row and cannot change Rating, XP, Badge, Career, or Ranking.

## Security / privacy boundary

- The guarded RPC confirms the current account is the team creator, tournament
  organizer, or admin.
- The database checks every selected athlete remains an accepted roster member.
  The client-side list is convenience only; a crafted request is rejected.
- Tactical notes and roster display are fetched only via the guarded RPC, not by
  granting broad direct table reads.
- The page returns minimal roster identity (display name and playing position)
  solely to the authorized team manager. It does not return contact, guardian,
  birth-date, or private-profile fields.

## Required production action (do not do without explicit approval)

1. In the Supabase SQL editor, verify project ref is exactly `hivedzrwrrcnjrlirhtv`.
2. Apply [`../sql/28-match-plans-v1.sql`](../sql/28-match-plans-v1.sql) once.
3. Verify the two RPCs exist:

```sql
select proname from pg_proc
where proname in ('get_match_plan_safely', 'save_match_plan_safely');
```

4. Deploy the reviewed app change.

## Closed-beta acceptance test

Use a coach/manager account, an athlete who accepted the invitation, and a second
athlete whose invitation is still pending.

1. Open `/match-plan`, choose the manager's team, and confirm only the accepted
   athlete appears.
2. Add that athlete as starter, choose a position, add notes, and save.
3. Refresh: selection, formation, and notes must persist.
4. Attempt to submit the pending athlete ID through the API: it must return 400
   with the accepted-roster error.
5. Open as an unrelated user: the page/API must deny access.
6. Confirm `/dashboard/results`, Rating, XP, and Career have not changed merely
   from saving the plan.
