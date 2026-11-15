import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// sql/97-province-views-security-invoker-v1.sql, read as text. Behaviour was drilled on
// Postgres 16 (runbook row 97): the views keep serving every caller while their tables allow it,
// and honour the tables' RLS once it does not.

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')
const sql = read('97-province-views-security-invoker-v1.sql')
const down = read('97-province-views-security-invoker-down.sql')

describe('SQL97: the province views read with the caller rights', () => {
  it('sets security_invoker on both views, in one transaction', () => {
    expect(sql).toMatch(/begin;[\s\S]*commit;/)
    expect(sql).toContain('alter view public.v_province_with_region set (security_invoker = true)')
    expect(sql).toContain('alter view public.v_region_with_province_count set (security_invoker = true)')
  })

  it('skips a view that does not exist, so it is safe on Staging', () => {
    expect(sql).toContain("if to_regclass('public.v_province_with_region') is not null then")
    expect(sql).toContain("if to_regclass('public.v_region_with_province_count') is not null then")
  })

  it('changes nothing else: no grant, policy, data or view body', () => {
    expect(sql).not.toMatch(/\b(grant|revoke|create policy|drop|insert|update|delete|create or replace view)\b/i)
  })

  it('has a rollback that resets the option on both views', () => {
    expect(down).toContain('alter view public.v_province_with_region reset (security_invoker)')
    expect(down).toContain('alter view public.v_region_with_province_count reset (security_invoker)')
  })

  it('stops the apply when the tables could not be read through the views', () => {
    const pre = read('97-province-views-security-invoker-precheck.sql')
    expect(pre).toContain('province_read')
    expect(pre).toContain('STOP')
  })
})
