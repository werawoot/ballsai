import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')

const migration = read('45-venue-photo-public-delivery-v1.sql')
const anonPolicy = migration.match(/create policy venue_photos_public_object_read[\s\S]*?;\n/)?.[0] ?? ''

const executableLines = (name: string) => read(name)
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .filter(line => line.trim().length > 0)

describe('SQL45 venue photo public delivery', () => {
  it('targets the right Supabase project and stays a new file', () => {
    expect(migration).toContain('hivedzrwrrcnjrlirhtv')
    expect(migration).toMatch(/^-- 45-venue-photo-public-delivery-v1\.sql/)
  })

  it('does not rewrite SQL43 or SQL44', () => {
    // SQL43 is applied. The only object SQL45 may drop is its own policy, so a re-run is
    // idempotent without touching anything SQL43 created.
    const drops = migration.match(/drop\s+\w+[\s\S]*?;/gi) ?? []
    for (const statement of drops) {
      expect(statement).toContain('venue_photos_public_object_read')
    }
    expect(migration).not.toContain('drop table')
    expect(migration).not.toContain('drop function')
    expect(migration).not.toContain('alter policy')
    expect(migration).not.toContain('alter table')
    // Naming an SQL43 policy in a precondition is fine; issuing DDL against one is not.
    for (const policy of [
      'venue_photos_owner_insert',
      'venue_photos_owner_or_admin_read',
      'venue_photos_owner_or_admin_delete',
      'venue_photos_select_visible_or_owner_or_admin',
    ]) {
      expect(migration).not.toMatch(new RegExp(`(drop|alter|create)\\s+policy[^;]*${policy}`, 'i'))
    }
  })

  it('refuses to run unless SQL43 is already in place', () => {
    const guard = migration.match(/do \$\$[\s\S]*?\$\$;/)?.[0] ?? ''
    expect(guard).toContain('venue_photos')
    expect(guard).toContain('raise exception')
    expect(guard).toContain("id = 'venue-photos'")
  })

  it('leaves the bucket private', () => {
    expect(migration).not.toMatch(/update storage\.buckets[\s\S]*?public\s*=\s*true/i)
    expect(migration).not.toContain('set public = true')
    // The guard must assert the bucket is still private rather than assume it.
    expect(migration).toMatch(/public\s*=\s*false/)
  })

  it('adds exactly one anonymous object-read policy, for select only', () => {
    expect(anonPolicy).toBeTruthy()
    expect(anonPolicy).toContain('on storage.objects')
    expect(anonPolicy).toContain('for select')
    expect(anonPolicy).toContain('to anon, authenticated')
    expect(migration.match(/create policy/g) ?? []).toHaveLength(1)
  })

  it('scopes the anonymous read to the venue-photos bucket', () => {
    expect(anonPolicy).toContain("bucket_id = 'venue-photos'")
  })

  it('scopes the anonymous read to a visible photo of a published venue', () => {
    expect(anonPolicy).toContain('public.venue_photos')
    expect(anonPolicy).toContain("moderation_status = 'visible'")
    expect(anonPolicy).toContain('public.venue_profiles')
    expect(anonPolicy).toContain('is_published')
  })

  it('matches the photo row by the stored object path, not by folder guesswork', () => {
    expect(anonPolicy).toContain('object_path = storage.objects.name')
  })

  it('never lets pending or hidden photos through', () => {
    expect(anonPolicy).not.toContain("'pending'")
    expect(anonPolicy).not.toContain("'hidden'")
    expect(anonPolicy).not.toMatch(/moderation_status\s*(<>|!=)/)
  })

  it('blocks bucket listing with the documented Storage helper', () => {
    // storage.operation() is not a helper Supabase documents. The documented way to allow
    // retrieving an object without allowing a listing is to name the retrieval operations
    // explicitly, so a list request matches no allowed operation.
    expect(anonPolicy).toContain('storage.allow_any_operation(')
    expect(anonPolicy).toContain("'object.get_authenticated_info'")
    expect(anonPolicy).toContain("'object.get_authenticated'")
  })

  it('never reintroduces the undocumented storage.operation() helper', () => {
    // Regression: the first draft of SQL45 guarded listing with storage.operation(),
    // which is not in the Supabase docs and would have failed or behaved unpredictably
    // on apply.
    // Checked against executable SQL only: a comment that warns future readers off the
    // undocumented helper is worth keeping.
    for (const name of [
      '45-venue-photo-public-delivery-v1.sql',
      '45-venue-photo-public-delivery-precheck.sql',
      '45-venue-photo-public-delivery-postcheck.sql',
    ]) {
      for (const line of executableLines(name)) {
        expect(line, `${name} must not call storage.operation()`).not.toContain('storage.operation()')
      }
    }
  })

  it('still pins the object path shape so no prefix matches', () => {
    expect(anonPolicy).toContain('array_length(storage.foldername(storage.objects.name), 1) = 1')
  })

  it('grants no new table or function privileges to anon', () => {
    const statements = migration
      .split('\n')
      .filter(line => !line.trimStart().startsWith('--'))
    for (const line of statements) {
      expect(line).not.toMatch(/^\s*(grant|revoke)\b/i)
      expect(line).not.toContain('service_role')
    }
  })

  it('verifies the documented Storage helper exists before creating the policy', () => {
    const guard = migration.match(/do \$\$[\s\S]*?\$\$;/)?.[0] ?? ''
    expect(guard).toContain("to_regprocedure('storage.allow_any_operation(text[])')")
    expect(guard).toContain('raise exception')
  })

  it('runs in a single transaction', () => {
    expect(migration).toMatch(/^begin;/m)
    expect(migration.trimEnd()).toMatch(/commit;$/)
  })

  it('ships read-only precheck and postcheck scripts', () => {
    for (const name of [
      '45-venue-photo-public-delivery-precheck.sql',
      '45-venue-photo-public-delivery-postcheck.sql',
    ]) {
      const statements = executableLines(name)
      expect(statements.some(line => line.trimStart().startsWith('select'))).toBe(true)
      for (const line of statements) {
        expect(line).not.toMatch(/^\s*(insert|update|delete|create|alter|drop|truncate|grant|revoke|call|do)\b/i)
      }
    }
  })

  it('has a precheck that proves the starting state before anyone applies it', () => {
    const precheck = read('45-venue-photo-public-delivery-precheck.sql')
    expect(precheck).toContain('hivedzrwrrcnjrlirhtv')
    expect(precheck).toContain("id = 'venue-photos'")
    expect(precheck).toContain('public = false')
    expect(precheck).toContain("to_regprocedure('storage.allow_any_operation(text[])')")
    // Applying twice must be caught before it happens.
    expect(precheck).toContain('venue_photos_public_object_read')
  })

  it('tells the operator to look for the helper the policy actually uses', () => {
    // Regression: the postcheck's expectation comment kept naming storage.operation(),
    // so whoever verified the apply would have looked for a predicate that is not there.
    const postcheck = read('45-venue-photo-public-delivery-postcheck.sql')
    expect(postcheck).toContain('allow_any_operation')
    expect(postcheck).not.toContain("storage.operation() = 'select'")
  })

  it('has a postcheck that proves only the intended policy landed', () => {
    const postcheck = read('45-venue-photo-public-delivery-postcheck.sql')
    expect(postcheck).toContain('venue_photos_public_object_read')
    expect(postcheck).toContain('pg_policies')
    expect(postcheck).toContain('public = false')
    // Pending and hidden objects must stay unreachable after the apply.
    expect(postcheck).toContain('moderation_status')
  })

  it('is recorded in the runbook as pending review, never as applied', () => {
    const runbook = readFileSync(new URL('../docs/closed-beta-runbook.md', import.meta.url), 'utf8')
    const row = runbook.split('\n').find(line => line.includes('45-venue-photo-public-delivery-v1.sql')) ?? ''
    expect(row, 'SQL45 must appear in the runbook table').toBeTruthy()
    expect(row).toContain('Pending review')
    expect(row).not.toContain('Applied')
    expect(row).toContain('43')
  })
})
