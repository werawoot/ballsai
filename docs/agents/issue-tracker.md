# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues in `werawoot/ballsai`. Use the
`gh` CLI for all operations from inside this clone.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`
- **Read an issue**: `gh issue view <number> --comments`
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments`
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` /
  `gh issue edit <number> --remove-label "..."`
- **Close an issue**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside the
clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

Set this to `yes` only if this repo starts treating external PRs as feature requests.
When enabled, use the matching `gh pr` commands and run PRs through the same labels and
states as issues.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The map is a single issue with child issues as tickets.

- **Map**: create one issue labelled `wayfinder:map`.
- **Child ticket**: create an issue linked to the map as a GitHub sub-issue when
  available. If sub-issues are not enabled, add the child to a task list in the map body
  and put `Part of #<map>` at the top of the child body.
- **Blocking**: prefer GitHub's native issue dependencies. If dependencies are not
  available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body.
- **Claim**: `gh issue edit <n> --add-assignee @me`
- **Resolve**: comment with the answer or implementation summary, close the issue, then
  update the map's Decisions-so-far.
