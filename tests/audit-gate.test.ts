import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { evaluateAudit, MAX_EXCEPTION_DAYS } from '../scripts/audit-gate.mjs'

// T22: a production dependency with a known high or critical hole must stop CI. The only
// way past is a written, dated exception that runs out, so nothing is parked for ever.

const advisory = (id: string, severity: string, name = 'next') => ({
  source: 1, name, dependency: name, severity, range: '<99', title: `${id} title`,
  url: `https://github.com/advisories/${id}`,
})
const report = (...via: ReturnType<typeof advisory>[]) => ({
  auditReportVersion: 2,
  vulnerabilities: Object.fromEntries(via.map(v => [v.name, { name: v.name, severity: v.severity, via: [v, 'some-parent'] }])),
})
const exception = (advisoryId: string, expires: string) => ({ advisory: advisoryId, package: 'next', expires, reason: 'r', plan: 'p' })
const today = '2026-09-29'

describe('dependency audit gate', () => {
  it('passes a clean report', () => {
    expect(evaluateAudit(report(), [], today)).toMatchObject({ ok: true, failures: [] })
  })

  it('fails on a high or critical advisory that has no exception', () => {
    const result = evaluateAudit(report(advisory('GHSA-aaaa-bbbb-cccc', 'high'), advisory('GHSA-dddd-eeee-ffff', 'critical', 'ws')), [], today)
    expect(result.ok).toBe(false)
    expect(result.failures.join('\n')).toMatch(/GHSA-aaaa-bbbb-cccc/)
    expect(result.failures.join('\n')).toMatch(/GHSA-dddd-eeee-ffff/)
  })

  it('lists moderate and low advisories without failing', () => {
    const result = evaluateAudit(report(advisory('GHSA-mmmm-mmmm-mmmm', 'moderate'), advisory('GHSA-llll-llll-llll', 'low', 'x')), [], today)
    expect(result).toMatchObject({ ok: true, failures: [] })
    expect(result.notes.join('\n')).toMatch(/GHSA-mmmm-mmmm-mmmm/)
  })

  it('lets an advisory through only while its exception is in date', () => {
    const r = report(advisory('GHSA-aaaa-bbbb-cccc', 'critical'))
    expect(evaluateAudit(r, [exception('GHSA-aaaa-bbbb-cccc', '2026-10-13')], today).ok).toBe(true)
    expect(evaluateAudit(r, [exception('GHSA-aaaa-bbbb-cccc', '2026-09-29')], today).ok).toBe(true)
    const expired = evaluateAudit(r, [exception('GHSA-aaaa-bbbb-cccc', '2026-09-28')], today)
    expect(expired.ok).toBe(false)
    expect(expired.failures.join('\n')).toMatch(/expired/)
  })

  it(`refuses an exception set more than ${MAX_EXCEPTION_DAYS} days ahead, or with no date or reason`, () => {
    const r = report(advisory('GHSA-aaaa-bbbb-cccc', 'high'))
    expect(evaluateAudit(r, [exception('GHSA-aaaa-bbbb-cccc', '2027-01-01')], today).ok).toBe(false)
    expect(evaluateAudit(r, [{ advisory: 'GHSA-aaaa-bbbb-cccc', package: 'next', expires: 'soon', reason: 'r', plan: 'p' }], today).ok).toBe(false)
    expect(evaluateAudit(r, [{ advisory: 'GHSA-aaaa-bbbb-cccc', package: 'next', expires: '2026-10-01', reason: '', plan: 'p' }], today).ok).toBe(false)
  })

  it('fails on an exception the report no longer needs, so the list is cleaned when the fix lands', () => {
    const result = evaluateAudit(report(), [exception('GHSA-aaaa-bbbb-cccc', '2026-10-13')], today)
    expect(result.ok).toBe(false)
    expect(result.failures.join('\n')).toMatch(/no longer reported/)
  })

  it('fails when npm could not produce a report instead of passing silently', () => {
    expect(evaluateAudit({ error: { code: 'ENOTFOUND', summary: 'registry down' } }, [], today).ok).toBe(false)
    expect(evaluateAudit(null, [], today).ok).toBe(false)
  })

  it('keeps the checked-in exception list well formed and within the time limit', () => {
    const list = JSON.parse(readFileSync(new URL('../security/audit-exceptions.json', import.meta.url), 'utf8'))
    expect(Array.isArray(list)).toBe(true)
    for (const entry of list) {
      expect(entry.advisory).toMatch(/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/)
      expect(entry.reason.length).toBeGreaterThan(10)
      expect(entry.plan.length).toBeGreaterThan(5)
      expect(entry.expires).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
