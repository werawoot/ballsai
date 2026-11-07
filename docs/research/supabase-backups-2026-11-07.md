# Supabase backups, PITR and plan cost for T29 (7 Nov 2026)

supabase.com is blocked from the agent environment, so the same pages were read from the
`supabase/supabase` repository on GitHub (branch `master`, 7 Nov 2026):

- `apps/docs/content/guides/platform/backups.mdx`
- `apps/docs/content/guides/platform/clone-project.mdx`
- `apps/docs/content/_partials/billing/pricing/pricing_pitr.mdx`
- `apps/docs/content/guides/platform/billing-on-supabase.mdx`
- `apps/docs/content/guides/platform/manage-your-usage/compute.mdx`
- `packages/shared-data/plans.ts`

Prices are in USD as published there; the dashboard shows the final amount before any charge.

## Findings

| Topic | What the docs say | Source |
| --- | --- | --- |
| Daily backups | "We automatically back up all Pro, Team, and Enterprise Plan projects on a daily basis." Pro keeps the last **7 days**. Free has none; the docs advise Free projects to export with `supabase db dump`. | backups.mdx |
| Storage files | "Database backups do not include objects you store via the Storage API." | backups.mdx |
| Custom role passwords | Daily backups do not store passwords for custom roles; reset them after a restore. | backups.mdx |
| Restore in place | Restores the project to a chosen backup. "The project is inaccessible during this process"; downtime grows with database size. | backups.mdx |
| Restore to a new project | Beta. Paid plans with physical backups. Creates a new project in the same region with a database-only copy (schema, data, roles, auth users, Vault key). Storage objects, Edge Functions, Auth settings and API keys are **not** copied. The new project is billed like any other project. Extensions that call out (`pg_cron`, `pg_net`, wrappers) start running at once. | clone-project.mdx |
| PITR | Add-on for Pro and above, any compute size. Worst-case data loss (RPO) 2 minutes. Enabling it **stops daily backups**. 7-day retention ~**$100/month** (14 days ~$200, 28 days ~$400). | backups.mdx, pricing_pitr.mdx |
| Plan billing | Billing is **per organization**; one plan per organization; "you cannot have both a Pro Plan project and a Free Plan project in the same organization." Paid plans stop project pausing for every project in the organization. | billing-on-supabase.mdx |
| Pro price | From **$25/month**, "Includes one project running on Micro compute." | plans.ts |
| Compute | Paid plans include **$10/month** compute credits = one Micro project. Each further Micro project ≈ **$10/month** (billed hourly). A Nano project kept after upgrading from Free is billed as Micro; moving Nano → Micro needs a restart (downtime). | compute.mdx |

## What this means for DOENSAI

- **Upgrading the Production organization to Pro: ~$25/month** if Production is the only
  running project in that organization (paused projects use no compute; the confirmation
  page shows the real total). If Staging sits in the same organization, Staging becomes Pro
  too and adds ~$10/month compute (total ~$35/month). Moving Staging to its own Free
  organization (project transfer) keeps it free.
- Until the upgrade, the docs advise Free projects to export with `supabase db dump`.
- **Daily backups (7 days) cover W1.** PITR (~$100/month) is not needed before real traffic;
  revisit at the provincial pilot.
- **Storage is not backed up** by Supabase backups: `athlete-avatars`, `slips`,
  `venue-photos`. That needs its own plan (a new task, not part of T29).
- **The T29 drill** can use "Restore to a new project": it does not touch Production, costs
  a few hours of Micro compute (cents) if the copy is deleted after the check. This repo's
  SQL uses no `pg_cron`, `pg_net` or wrappers, but extensions or webhooks turned on in the
  dashboard are not in `sql/`: check Production's enabled extensions before the drill. The first daily backup appears only after the upgrade, so the drill is a day later.
