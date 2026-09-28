import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')
const code = (name: string) => read(name).split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
const migration = code('50-anon-definer-execute-revoke-v1.sql')

// Supabase grants EXECUTE on every new function in public to anon (and PUBLIC), so a
// SECURITY DEFINER function stays callable by signed-out visitors unless each file
// revokes it by name. SQL50 closes that for every definer function except the five that
// anonymous requests genuinely need.
const ANON_BY_DESIGN = [
  'is_admin()', // evaluated inside RLS policies that anon reads through
  'is_organizer()',
  'is_accepted_guardian_for(uuid)', // RLS on public athlete pages
  'confirm_guardian_verification(text)', // guardian follows an emailed link, signed out
  'revoke_guardian_consent(text,text)',
]

describe('SQL50 anon EXECUTE on SECURITY DEFINER functions', () => {
  it('keeps exactly the five functions anonymous requests need', () => {
    for (const signature of ANON_BY_DESIGN) expect(migration).toContain(`'${signature}'`)
    const allowlist = migration.match(/v_anon_allowed\s+text\[\]\s*:=\s*array\[([\s\S]*?)\]/)?.[1] ?? ''
    expect(allowlist.match(/'[^']+'/g)).toHaveLength(ANON_BY_DESIGN.length)
  })

  it('targets definer functions in public and audit, never extension members', () => {
    expect(migration).toContain('p.prosecdef')
    expect(migration).toMatch(/nspname\s+in\s+\('public',\s*'audit'\)/)
    expect(migration).toContain("deptype = 'e'")
  })

  it('revokes from anon and PUBLIC, and gives back whatever authenticated loses', () => {
    expect(migration).toMatch(/revoke execute on function %s from anon, public/i)
    expect(migration).toMatch(/grant execute on function %s to authenticated/i)
  })

  // Postgres's own EXECUTE-to-PUBLIC default is global. A per-schema default can only add
  // to the global one, never take it away, so the revoke must be global as well. The first
  // draft revoked only `in schema public`; its self-check caught a new function still
  // executable by anon on a sandbox Postgres and rolled the whole migration back.
  it('stops new functions from becoming anon-executable by default, globally and in public', () => {
    expect(migration).toMatch(/alter default privileges for role postgres\s+revoke execute on functions from public, anon/i)
    expect(migration).toMatch(/alter default privileges for role postgres in schema public\s+revoke execute on functions from anon/i)
    expect(migration).toMatch(/alter default privileges for role postgres in schema public\s+grant execute on functions to authenticated/i)
  })

  it('verifies itself and rolls back on any leftover or lost grant', () => {
    const verification = migration.slice(migration.lastIndexOf('do $$'))
    expect(verification).toContain("has_function_privilege('anon'")
    expect(verification).toContain("has_function_privilege('authenticated'")
    expect(verification).toContain('raise exception')
    expect(migration).toMatch(/^begin;/m)
    expect(migration).toMatch(/^commit;/m)
  })

  it.each(['50-anon-definer-execute-revoke-precheck.sql', '50-anon-definer-execute-revoke-postcheck.sql'])('%s only reads', name => {
    expect(code(name)).toMatch(/\bselect\b/i)
    expect(code(name)).not.toMatch(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate|do)\b/im)
  })
})
