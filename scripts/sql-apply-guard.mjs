// The guard of the "Apply SQL" workflow (.github/workflows/apply-sql.yml). It decides which
// file may run where, and with which checks; the workflow stops on any refusal. Pure, so it
// is unit-tested (tests/sql-apply-guard.test.ts). CLI: prints the plan as JSON, or exits 1.
import { existsSync, appendFileSync } from 'node:fs'

export const PROJECT_REFS = { staging: 'vorpnkedpscsqhnrssrl', production: 'hivedzrwrrcnjrlirhtv' }

// Never through this workflow: AGENTS.md rule 4, and data fixes already applied by hand.
const NEVER = new Set([
  'sql/supabase-rls-private-slips.sql',
  'sql/sample-data.sql',
  'sql/66-production-sample-data-cleanup-v1.sql',
  'sql/67-production-test-data-cleanup-v1.sql',
])

// Only numbered migrations, by their plain path: no checks, bundles or unnumbered files.
const MIGRATION = /^sql\/(\d{2}-[a-z0-9-]+)-v\d+\.sql$/

export function planSqlApply({ file, target, dbUrl, confirm, exists }) {
  if (!Object.hasOwn(PROJECT_REFS, target)) return { ok: false, reason: 'unknown_target' }
  if (!dbUrl) return { ok: false, reason: 'missing_db_url' }
  const match = MIGRATION.exec(file ?? '')
  if (!match || NEVER.has(file)) return { ok: false, reason: 'not_a_migration' }
  if (!exists(file)) return { ok: false, reason: 'file_missing' }
  // The connection string names its project (postgres.<ref>@ on the pooler, db.<ref>. direct).
  // The other project's ref, or none, stops the run before anything is sent.
  const ref = PROJECT_REFS[target]
  const other = Object.values(PROJECT_REFS).find(value => value !== ref)
  if (!dbUrl.includes(ref) || dbUrl.includes(other)) return { ok: false, reason: 'wrong_project' }
  // Production asks for the file name typed again, so a wrong pick in the form cannot run.
  if (target === 'production' && confirm !== file.slice('sql/'.length)) return { ok: false, reason: 'confirm_mismatch' }
  const check = kind => {
    const path = `sql/${match[1]}-${kind}.sql`
    return exists(path) ? path : null
  }
  return { ok: true, migration: file, precheck: check('precheck'), postcheck: check('postcheck') }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const plan = planSqlApply({
    file: process.env.SQL_FILE,
    target: process.env.SQL_TARGET,
    dbUrl: process.env.DB_URL,
    confirm: process.env.SQL_CONFIRM ?? '',
    exists: existsSync,
  })
  if (!plan.ok) {
    console.error(`Refused: ${plan.reason}`)
    process.exit(1)
  }
  console.log(JSON.stringify(plan))
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `migration=${plan.migration}\nprecheck=${plan.precheck ?? ''}\npostcheck=${plan.postcheck ?? ''}\n`)
  }
}
