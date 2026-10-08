import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM script without types
import { planSqlApply } from '../scripts/sql-apply-guard.mjs'

// The guard of the "Apply SQL" workflow: which file may run where, with which checks.
// It refuses rather than guesses; the workflow stops on any refusal.
const STAGING_URL = 'postgresql://postgres.vorpnkedpscsqhnrssrl:x@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'
const PRODUCTION_URL = 'postgresql://postgres.hivedzrwrrcnjrlirhtv:x@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'
const files = ['sql/60-match-result-request-id-v1.sql', 'sql/60-match-result-request-id-precheck.sql', 'sql/60-match-result-request-id-postcheck.sql',
  'sql/61-first-match-rank-v1.sql', 'sql/61-first-match-rank-postcheck.sql', 'sql/sample-data.sql', 'sql/supabase-rls-private-slips.sql']
const exists = (path: string) => files.includes(path)

describe('planSqlApply', () => {
  it('plans a numbered migration with its precheck and postcheck', () => {
    expect(planSqlApply({ file: 'sql/60-match-result-request-id-v1.sql', target: 'staging', dbUrl: STAGING_URL, confirm: '', exists })).toEqual({
      ok: true,
      migration: 'sql/60-match-result-request-id-v1.sql',
      precheck: 'sql/60-match-result-request-id-precheck.sql',
      postcheck: 'sql/60-match-result-request-id-postcheck.sql',
    })
  })
  it('runs without a precheck when the migration has none', () => {
    expect(planSqlApply({ file: 'sql/61-first-match-rank-v1.sql', target: 'staging', dbUrl: STAGING_URL, confirm: '', exists }))
      .toMatchObject({ ok: true, precheck: null, postcheck: 'sql/61-first-match-rank-postcheck.sql' })
  })
  it('refuses a connection string for the other project', () => {
    expect(planSqlApply({ file: 'sql/60-match-result-request-id-v1.sql', target: 'staging', dbUrl: PRODUCTION_URL, confirm: '', exists }))
      .toMatchObject({ ok: false, reason: 'wrong_project' })
  })
  it('asks Production for the file name typed again', () => {
    const base = { file: 'sql/60-match-result-request-id-v1.sql', target: 'production', dbUrl: PRODUCTION_URL, exists }
    expect(planSqlApply({ ...base, confirm: '' })).toMatchObject({ ok: false, reason: 'confirm_mismatch' })
    expect(planSqlApply({ ...base, confirm: '60-match-result-request-id-v1.sql' })).toMatchObject({ ok: true })
  })
  it('refuses files that must never be applied, checks, and unknown paths', () => {
    for (const file of ['sql/sample-data.sql', 'sql/supabase-rls-private-slips.sql', 'sql/60-match-result-request-id-precheck.sql', 'sql/99-missing-v1.sql', '../etc/passwd', 'sql/60-x-v1.sql; drop table x'])
      expect(planSqlApply({ file, target: 'staging', dbUrl: STAGING_URL, confirm: '', exists }).ok).toBe(false)
  })
  it('refuses an unknown target or an empty connection string', () => {
    expect(planSqlApply({ file: 'sql/60-match-result-request-id-v1.sql', target: 'prod', dbUrl: PRODUCTION_URL, confirm: '', exists })).toMatchObject({ ok: false, reason: 'unknown_target' })
    expect(planSqlApply({ file: 'sql/60-match-result-request-id-v1.sql', target: 'staging', dbUrl: '', confirm: '', exists })).toMatchObject({ ok: false, reason: 'missing_db_url' })
  })
})
