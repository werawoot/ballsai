import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// T51 / SQL62. Behaviour was drilled on Postgres 16 with Supabase's storage helpers (see
// docs/closed-beta-runbook.md row 62). These checks keep the reviewed shape of the file.
const raw = readFileSync(new URL('../sql/62-private-athlete-avatars-v1.sql', import.meta.url), 'utf8')
const code = raw.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n').replace(/\s+/g, ' ')
const publicPolicy = code.slice(code.indexOf('create policy athlete_avatars_public_profile_sign'), code.indexOf('commit;'))

describe('SQL62 private athlete avatars', () => {
  it('makes the bucket private and removes the read-everything policy, in one transaction', () => {
    expect(code).toMatch(/^ ?begin;/)
    expect(code.trim()).toMatch(/commit;$/)
    expect(code).toContain("update storage.buckets set public = false where id = 'athlete-avatars';")
    expect(code).toContain('drop policy if exists "athlete_avatars_public_read" on storage.objects;')
  })

  it('refuses to run without the storage helper that stops a bucket listing', () => {
    expect(code).toMatch(/to_regprocedure\('storage\.allow_any_operation\(text\[\]\)'\) is null then raise exception/)
  })

  it('lets anyone else only sign, and only the photo a public profile points at', () => {
    expect(publicPolicy).toContain("storage.allow_any_operation(array['object.sign', 'object.sign_many'])")
    expect(publicPolicy).not.toMatch(/object\.list|get_authenticated/)
    expect(publicPolicy).toContain('p.is_public')
    expect(publicPolicy).toContain('p.profile_image_url = storage.objects.name')
    // The folder is cast to uuid only when it is one, so the primary key serves the lookup.
    expect(publicPolicy).toContain('where p.user_id = case')
  })

  it('keeps the owner and admin read to signed-in users, and leaves the write policies alone', () => {
    const owner = code.slice(code.indexOf('create policy athlete_avatars_owner_or_admin_read'), code.indexOf('drop policy if exists athlete_avatars_public_profile_sign'))
    expect(owner).toMatch(/to authenticated using/)
    expect(owner).toContain('(select auth.uid())::text')
    expect(owner).toContain('(select public.is_admin())')
    expect(code).not.toMatch(/athlete_avatars_owner_(insert|update|delete)/)
  })
})
