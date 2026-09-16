import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')

const migration = read('42-notification-privilege-hardening-v1.sql')

describe('SQL42 notification privilege hardening', () => {
  it('is a new transaction that requires the notification table and helper', () => {
    expect(migration).toContain('begin;')
    expect(migration).toContain('commit;')
    expect(migration).toContain("to_regclass('public.notifications')")
    expect(migration).toContain("to_regprocedure('public.create_notification(uuid,text,text,text,text,text)')")
  })

  it('removes direct execute access to the security-definer helper', () => {
    const signature = 'public.create_notification(uuid, text, text, text, text, text)'
    expect(migration).toContain(`revoke all on function ${signature} from public, anon, authenticated, service_role;`)
    expect(migration).not.toContain(`grant execute on function ${signature} to authenticated;`)
  })

  it('limits browser table access to selecting and acknowledging read_at only', () => {
    expect(migration).toContain('revoke all on table public.notifications from public, anon, authenticated, service_role;')
    expect(migration).toContain('grant select on table public.notifications to authenticated;')
    expect(migration).toContain('grant update (read_at) on table public.notifications to authenticated;')
  })

  it('sets an empty search path without redefining the applied helper body', () => {
    const signature = 'public.create_notification(uuid, text, text, text, text, text)'
    expect(migration).toContain(`alter function ${signature}\n  set search_path = '';`)
    expect(migration).not.toContain('create or replace function public.create_notification')
  })

  it('self-verifies the effective function and table privilege boundary', () => {
    expect(migration).toContain('has_function_privilege')
    expect(migration).toContain("has_table_privilege('authenticated', 'public.notifications', 'insert')")
    expect(migration).toContain("has_column_privilege('authenticated', 'public.notifications', 'read_at', 'update')")
    expect(migration).toContain("has_table_privilege('anon', 'public.notifications', 'select')")
  })

  it('keeps the precheck and postcheck read-only', () => {
    for (const name of [
      '42-notification-privilege-hardening-precheck.sql',
      '42-notification-privilege-hardening-postcheck.sql',
    ]) {
      const statements = read(name)
        .split('\n')
        .filter(line => !line.trimStart().startsWith('--'))
        .filter(line => line.trim().length > 0)

      expect(statements.some(line => line.startsWith('select'))).toBe(true)
      for (const line of statements) {
        expect(line).not.toMatch(/^\s*(insert|update|delete|create|alter|drop|truncate|grant|revoke|call|do)\b/i)
      }
    }
  })
})
