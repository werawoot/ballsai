import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')

const migration = read('43-venue-photos-v1.sql')
const policyFix = read('44-venue-photo-storage-policy-fix-v1.sql')

const executableLines = (name: string) => read(name)
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .filter(line => line.trim().length > 0)

describe('SQL43 venue photos', () => {
  it('creates a private venue-photos bucket', () => {
    expect(migration).toContain("'venue-photos'")
    expect(migration).toMatch(/insert into storage\.buckets[\s\S]*?'venue-photos'[\s\S]*?false/i)
  })

  it('stores a new venue image as pending instead of publishing it immediately', () => {
    expect(migration).toContain('create table public.venue_photos')
    expect(migration).toContain("moderation_status text not null default 'pending'")
    expect(migration).toContain("check (moderation_status in ('pending', 'visible', 'hidden'))")
  })

  it('lets the public read only visible photos from published venues', () => {
    expect(migration).toContain('create policy venue_photos_select_visible_or_owner_or_admin')
    expect(migration).toContain("moderation_status = 'visible'")
    expect(migration).toContain('v.is_published')
  })

  it('keeps private object reads limited to the owner or admin', () => {
    expect(migration).toContain('create policy venue_photos_owner_or_admin_read')
    expect(migration).toContain("bucket_id = 'venue-photos'")
    expect(migration).not.toContain('create policy venue_photos_visible_read')
    const readPolicy = migration.match(/create policy venue_photos_owner_or_admin_read[\s\S]*?;\n/)?.[0] ?? ''
    expect(readPolicy).toContain('to authenticated')
    expect(readPolicy).not.toContain('to anon')
  })

  it('allows uploads only as a venue-scoped WebP object', () => {
    const insertPolicy = migration.match(/create policy venue_photos_owner_insert[\s\S]*?;\n/)?.[0] ?? ''
    expect(insertPolicy).toContain('and name ~ (')
    expect(insertPolicy).toContain('.webp$')
  })

  it('limits mutations to hardened authenticated RPCs', () => {
    for (const rpc of [
      'add_venue_photo_safely',
      'set_venue_photo_cover_safely',
      'reorder_venue_photos_safely',
      'remove_venue_photo_safely',
      'moderate_venue_photo_safely',
    ]) {
      const body = migration.match(new RegExp(`create or replace function public\\.${rpc}[\\s\\S]*?\\n\\$\\$;`))?.[0]
      expect(body, `${rpc} must exist`).toBeTruthy()
      expect(body).toContain('security definer')
      expect(body).toContain("set search_path = ''")
      expect(migration).toContain(`grant execute on function public.${rpc}`)
    }
    expect(migration).toContain('revoke all on table public.venue_photos from anon, authenticated, service_role')
    expect(migration).toContain('grant select on table public.venue_photos to anon, authenticated')
  })

  it('makes only admins able to approve or hide an image and audits that action', () => {
    const moderate = migration.match(/create or replace function public\.moderate_venue_photo_safely[\s\S]*?\n\$\$;/)?.[0] ?? ''
    expect(moderate).toContain('public.is_admin()')
    expect(moderate).toContain('audit.write_admin_event')
    expect(moderate).toContain("p_status not in ('visible', 'hidden')")
  })

  it('ships read-only precheck and postcheck scripts', () => {
    for (const name of ['43-venue-photos-precheck.sql', '43-venue-photos-postcheck.sql']) {
      const statements = executableLines(name)
      expect(statements.some(line => line.trimStart().startsWith('select'))).toBe(true)
      for (const line of statements) {
        expect(line).not.toMatch(/^\s*(insert|update|delete|create|alter|drop|truncate|grant|revoke|call|do)\b/i)
      }
    }
  })

  it('fails the migration if any hardened rpc retains browser execution privileges', () => {
    expect(migration).toContain('has_function_privilege')
    expect(migration).toContain("'anon'")
    expect(migration).toContain("'service_role'")
    expect(migration).toContain("'authenticated'")
  })
})

describe('SQL44 venue-photo storage policy fix', () => {
  it('binds the owner check to the storage object path, not venue_profiles.name', () => {
    expect(policyFix).toContain('drop policy if exists venue_photos_owner_insert on storage.objects')
    expect(policyFix).toContain('create policy venue_photos_owner_insert')

    const insertPolicy = policyFix.match(/create policy venue_photos_owner_insert[\s\S]*?;\n/)?.[0] ?? ''
    expect(insertPolicy).toContain('storage.foldername(storage.objects.name)')
    expect(insertPolicy).not.toContain('storage.foldername(v.name)')
  })

  // SQL43's read and delete policies have the same scoping bug: inside the venue_profiles
  // subquery an unqualified `name` is v.name, so an owner could neither read (the signed
  // preview) nor delete their own photo objects. Reproduced on a sandbox Postgres
  // 28 Sep 2026: owner saw 0 of their objects and deleted 0.
  it.each(['venue_photos_owner_or_admin_read', 'venue_photos_owner_or_admin_delete'])('repairs %s the same way', policy => {
    expect(policyFix).toContain(`drop policy if exists ${policy} on storage.objects`)
    const body = policyFix.match(new RegExp(`create policy ${policy}[\\s\\S]*?;\\n`))?.[0] ?? ''
    expect(body).toContain('to authenticated')
    expect(body).toContain('public.is_admin()')
    expect(body).toContain('storage.foldername(storage.objects.name)')
    expect(body).not.toMatch(/storage\.foldername\(name\)/)
  })

  // pg_policies stores the deparsed expression, where Postgres writes the column as
  // `objects.name`: `storage.foldername(objects.name)`, never `storage.objects.name`.
  // The first SQL44 draft verified against `storage.objects.name`, so it rolled itself
  // back on every apply. Checks must compare against the text Postgres actually stores.
  it('verifies itself against the text Postgres stores, for all three policies', () => {
    const verification = policyFix.slice(policyFix.lastIndexOf('do $$'))
    for (const policy of ['venue_photos_owner_insert', 'venue_photos_owner_or_admin_read', 'venue_photos_owner_or_admin_delete']) {
      expect(verification).toContain(policy)
    }
    expect(verification).toContain("'%foldername(objects.name)%'")
    expect(verification).toContain("'%foldername(v.name)%'")
    expect(verification).not.toContain("'%storage.foldername(storage.objects.name)%'")
  })

  it.each(['44-venue-photo-storage-policy-fix-precheck.sql', '44-venue-photo-storage-policy-fix-postcheck.sql'])(
    '%s reads the stored policy text the same way, for all three policies',
    name => {
      const check = read(name)
      expect(check).toContain("'%foldername(objects.name)%'")
      expect(check).not.toContain("'%storage.foldername(storage.objects.name)%'")
      expect(check).toContain('venue_photos_owner_or_admin_read')
      expect(check).toContain('venue_photos_owner_or_admin_delete')
    },
  )

  it('ships read-only precheck and postcheck scripts', () => {
    for (const name of [
      '44-venue-photo-storage-policy-fix-precheck.sql',
      '44-venue-photo-storage-policy-fix-postcheck.sql',
    ]) {
      const statements = executableLines(name)
      expect(statements.some(line => line.trimStart().startsWith('select'))).toBe(true)
      for (const line of statements) {
        expect(line).not.toMatch(/^\s*(insert|update|delete|create|alter|drop|truncate|grant|revoke|call|do)\b/i)
      }
    }
  })
})
