import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// SQL77: a signed-in user could set their own profiles.role to admin, and their
// profiles.email to someone else's address. The behaviour is proven in the Postgres
// sandbox (runbook row 77); this pins the parts a later edit must not lose.
const sql = readFileSync('sql/77-profile-privilege-guard-v1.sql', 'utf8')
const body = sql.replace(/--[^\n]*/g, '')

describe('sql/77 profile privilege guard', () => {
  it('guards inserts as well as updates of role and email', () => {
    expect(body).toMatch(/before insert or update of role, email on public\.profiles/)
  })

  it('refuses a role change and a foreign email for a signed-in non-admin only', () => {
    expect(body).toMatch(/if v_user is null or public\.is_admin\(\) then\s+return new;/)
    expect(body).toMatch(/coalesce\(new\.role, 'user'\) <> 'user'/)
    expect(body).toMatch(/new\.role is distinct from old\.role/)
    expect(body).toMatch(/from auth\.users u where u\.id = new\.id/)
    expect(body).toContain("'ROLE_CHANGE_NOT_ALLOWED'")
    expect(body).toContain("'EMAIL_CHANGE_NOT_ALLOWED'")
  })

  it('keeps the function out of reach and checks itself before commit', () => {
    expect(body).toMatch(/revoke all on function public\.profiles_guard_privileged_columns\(\) from public, anon, authenticated/)
    expect(body).toMatch(/SQL77 trigger is missing or disabled/)
    expect(body.trim().endsWith('commit;')).toBe(true)
  })

  it('never writes role or email from the app', () => {
    for (const file of ['app/profile/EditProfileForm.tsx', 'app/card/PlayerCardBuilder.tsx', 'app/welcome/OnboardingFlow.tsx']) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from\('profiles'\)[\s\S]{0,200}\b(role|email):/)
    }
  })
})
