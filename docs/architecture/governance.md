# Architecture Governance Rules — BallDoenSai.com

These rules keep `docs/architecture/**` a trustworthy source of truth for both the
Founder and AI coding agents. They are enforced by habit and by code review, not by
tooling (yet).

1. **Architecture changes must update diagrams.**
   Any change to containers/components must update the matching Mermaid diagram in
   `system-architecture.md` (and `system-context.md` if actors change).

2. **Database changes must update the ERD.**
   Any new table/column/FK or RLS change must be reflected in `erd.md` and, if it is a
   core table, in `../data/README.md`. All schema changes are new files in `sql/`
   (never edit an applied migration — see `AGENTS.md` rule 3).

3. **API changes must update the API map.**
   New/changed/removed route handlers must be reflected in `api-map.md` immediately.

4. **AI changes must update the AI architecture.**
   If any AI subsystem moves from PLANNED to EXISTING, update `ai-architecture.md` and
   add an ADR. Do not silently introduce an AI dependency.

5. **Major features must update the Data Flow.**
   New end-to-end flows (or changed ones) update `data-flow.md` and, when relevant,
   `sequence.md`.

6. **Every major architectural decision requires an ADR.**
   Put it in `../decisions/` as `ADR-NNN-<topic>.md` and link it from
   `../decisions/README.md`.

7. **Documentation must reflect actual implementation.**
   No diagram, table, or claim may describe something that is not in the code. If you are
   unsure, mark it `UNKNOWN`. Never invent undocumented architecture.

8. **AI coding agent discipline.**
   See `/AGENTS.md` (repo root) and `../decisions/README.md`. In short: read the
   architecture before editing code; never break the verified-result integrity chain;
   check Data Flow before changing DB/API; update docs on architecture change; never
   create a duplicate service without checking the existing one.

## Review checklist (before merge)

- [ ] Diagrams still match `sql/` + `app/`.
- [ ] No broken relative links between docs.
- [ ] Mermaid blocks are syntactically valid (render on GitHub).
- [ ] Nothing is marked EXISTING that is not in code.
- [ ] New ADR referenced from `decisions/README.md` if a decision was made.
