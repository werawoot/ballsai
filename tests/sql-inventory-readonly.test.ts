import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// sql/inventory/ holds catalog queries handed to people and agents to run against
// Staging and Production. They must never change anything, whoever edits them next.
const dir = new URL('../sql/inventory/', import.meta.url)
const files = readdirSync(dir).filter(name => name.endsWith('.sql'))
const statements = (name: string) => readFileSync(new URL(name, dir), 'utf8')
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')

describe('read-only inventory queries', () => {
  it('ships all six queries', () => {
    expect(files.sort()).toEqual([
      'inventory-1-migrations.sql',
      'inventory-2-invite-team-member-version.sql',
      'inventory-3-notification-privileges.sql',
      'inventory-4-anon-executable-functions.sql',
      'inventory-5-function-bodies.sql',
      'inventory-6-schema-and-default-privileges.sql',
    ])
  })

  it.each(files)('%s only reads', name => {
    expect(statements(name)).not.toMatch(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate|do|call|copy|vacuum|comment|security|set)\b/im)
  })

  it.each(files)('%s tells the reader to check the project ref first', name => {
    expect(readFileSync(new URL(name, dir), 'utf8')).toMatch(/hivedzrwrrcnjrlirhtv/)
  })
})
