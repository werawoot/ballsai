#!/usr/bin/env node
// T22. Stops CI when a production dependency has a known high or critical advisory.
//
//   node scripts/audit-gate.mjs                  runs `npm audit` on package-lock.json itself
//   node scripts/audit-gate.mjs --report a.json  judges a saved report instead
//
// The only way past a blocking advisory is an entry in security/audit-exceptions.json with
// a reason, a plan and an expiry date at most MAX_EXCEPTION_DAYS ahead. An expired entry,
// or one the report no longer needs, fails too, so the list never outlives the problem.
// Moderate and low advisories are printed but do not fail the run.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const MAX_EXCEPTION_DAYS = 30
const BLOCKING = new Set(['high', 'critical'])
const DAY_MS = 24 * 60 * 60 * 1000

const advisoryId = url => String(url ?? '').split('/').pop()
const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)

// Every advisory in an `npm audit --json` report (v2), once each. A package's `via` list
// holds advisory objects and the names of other vulnerable packages; only the objects are
// advisories.
export function listAdvisories(report) {
  const seen = new Map()
  for (const entry of Object.values(report?.vulnerabilities ?? {})) {
    for (const via of entry?.via ?? []) {
      if (!via || typeof via !== 'object' || !via.url) continue
      const id = advisoryId(via.url)
      if (!seen.has(id)) seen.set(id, { id, package: via.name, severity: via.severity, range: via.range, title: via.title, url: via.url })
    }
  }
  return [...seen.values()]
}

export function evaluateAudit(report, exceptions, today) {
  const failures = []
  const notes = []
  if (!report || typeof report !== 'object' || report.error || !report.vulnerabilities) {
    const reason = report?.error?.summary || report?.error?.code || 'no report'
    return { ok: false, failures: [`npm audit did not produce a report (${reason}); the gate cannot pass without one`], notes }
  }

  const byId = new Map()
  for (const entry of exceptions ?? []) {
    const label = `exception ${entry?.advisory ?? '(no advisory)'}`
    if (!entry?.advisory || !entry?.reason?.trim() || !entry?.plan?.trim()) { failures.push(`${label}: needs advisory, reason and plan`); continue }
    if (!isDate(entry.expires)) { failures.push(`${label}: expires must be a YYYY-MM-DD date`); continue }
    if (daysBetween(today, entry.expires) > MAX_EXCEPTION_DAYS) { failures.push(`${label}: expires ${entry.expires}, more than ${MAX_EXCEPTION_DAYS} days ahead; set a nearer date and fix it`); continue }
    byId.set(entry.advisory, entry)
  }

  const advisories = listAdvisories(report)
  const reported = new Set(advisories.map(a => a.id))
  for (const a of advisories) {
    const line = `${a.severity} ${a.package} ${a.range} ${a.id} ${a.title}`
    if (!BLOCKING.has(a.severity)) { notes.push(line); continue }
    const allowed = byId.get(a.id)
    if (!allowed) failures.push(`${line}\n    no exception: upgrade the package, or add a dated entry to security/audit-exceptions.json`)
    else if (daysBetween(today, allowed.expires) < 0) failures.push(`${line}\n    exception expired on ${allowed.expires}: ${allowed.plan}`)
    else notes.push(`${line} (exception until ${allowed.expires}: ${allowed.plan})`)
  }
  for (const id of byId.keys()) {
    if (!reported.has(id)) failures.push(`exception ${id} is no longer reported by npm audit; remove it from security/audit-exceptions.json`)
  }
  return { ok: failures.length === 0, failures, notes }
}

function runNpmAudit() {
  const run = spawnSync('npm', ['audit', '--omit=dev', '--package-lock-only', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  // npm audit exits 1 whenever it finds anything; the JSON on stdout is what counts.
  try { return JSON.parse(run.stdout) } catch { return { error: { summary: (run.stderr || 'unreadable output').trim().slice(0, 300) } } }
}

async function main() {
  const reportFlag = process.argv.indexOf('--report')
  const report = reportFlag > 0 ? JSON.parse(readFileSync(process.argv[reportFlag + 1], 'utf8')) : runNpmAudit()
  const exceptions = JSON.parse(readFileSync(new URL('../security/audit-exceptions.json', import.meta.url), 'utf8'))
  const today = new Date().toISOString().slice(0, 10)
  const { ok, failures, notes } = evaluateAudit(report, exceptions, today)
  for (const note of notes) console.log(`  note  ${note}`)
  for (const failure of failures) console.error(`  FAIL  ${failure}`)
  console.log(ok ? 'Dependency audit: no unexcepted high or critical advisory in production dependencies.' : `Dependency audit failed: ${failures.length} problem(s).`)
  process.exit(ok ? 0 : 1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
