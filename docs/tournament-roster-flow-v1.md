# Tournament-scoped roster flow V1

Agreed product rule: a team belongs to one tournament only. It is not a permanent
club; athletes may join a different team for a later tournament.

```text
Coach / organizer creates a draft team for a tournament
→ invites athlete accounts
→ athletes accept or decline
→ manager submits when the accepted roster is ready
→ payment slip → organizer confirmation → match
→ organizer records only accepted roster members
→ rating, XP, badges, ranking and career update
```

`sql/20-tournament-roster-flow-v1.sql` implements the database guardrails. Apply it
only after steps 18 and 19, to project `hivedzrwrrcnjrlirhtv`, and validate using
throwaway beta accounts before inviting real users. It is not applied by this worktree.

## Athlete journey

```text
Browse open tournaments
→ tell a coach/organizer which tournament is interesting
→ receive an in-app invitation
→ accept it at /team-members
→ see the team's registration status in /profile
→ after a confirmed match result, see rating / XP / badge changes in /career
```

An athlete does not create a tournament team or upload a payment slip. The account
that creates the tournament-scoped team owns those manager steps.
