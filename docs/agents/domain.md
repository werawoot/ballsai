# Domain Docs

How the engineering skills should consume this repo's domain documentation when
exploring the codebase.

## Before exploring, read these

- `AGENTS.md` at the repo root for BallDoenSai-specific rules.
- `README.md` for product vision, current status, routes, SQL inventory, and handoff.
- `docs/closed-beta-runbook.md` before touching closed-beta setup, Supabase SQL apply
  order, storage, roles, security checks, or monitoring checks.
- `docs/architecture/README.md` before changing structure, DB, API, rating, auth, or
  verified-result flows.
- Relevant architecture files in `docs/architecture/`, especially `data-flow.md`,
  `sequence.md`, `erd.md`, `api-map.md`, and `governance.md`.
- Relevant ADRs in `docs/decisions/`.

If a referenced file does not exist, proceed silently. Do not create new domain docs
unless the current work resolves a term, decision, schema change, route change, or
architecture change that needs documentation.

## File structure

This is a single-context repo:

```text
/
├── AGENTS.md
├── README.md
├── docs/
│   ├── agents/
│   ├── architecture/
│   ├── decisions/
│   └── data/
├── app/
├── components/
├── lib/
└── sql/
```

## Use the project's vocabulary

Use the BallDoenSai domain terms already established in `AGENTS.md`, `README.md`, and
`docs/architecture/**`: Digital Sports Identity, Player Card, Power Rating, XP, Badge,
Career Timeline, Highlight, Hall of Fame, guardian consent, verified match result,
`self`, `coach_verified`, and `performance_verified`.

Do not present default athlete-facing values as verified performance. A card without a
`player_ranks` row is a STARTER card.

## Flag ADR conflicts

If proposed work contradicts an existing ADR in `docs/decisions/`, surface the conflict
explicitly and ask whether the decision should be reopened.

## Documentation updates

Follow `docs/architecture/governance.md`:

- New table, column, foreign key, or RLS policy: update `docs/architecture/erd.md` and
  `docs/data/README.md`.
- New or changed route handler: update `docs/architecture/api-map.md`.
- New component or structural diagram change: update `docs/architecture/system-architecture.md`.
- New decision: add an ADR in `docs/decisions/` and link it from
  `docs/decisions/README.md`.
