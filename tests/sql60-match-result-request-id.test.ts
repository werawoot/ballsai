import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')
const code = (name: string) => read(name).split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
const raw = code('60-match-result-request-id-v1.sql')
const migration = raw.replace(/\s+/g, ' ')

// A draw that moves no rating slipped past RATING_CHANGED and was recorded twice on a
// retry. Run on Postgres 16 before commit: five concurrent calls with one id gave one
// result and five identical answers; the same five against a mutant without the request
// key gave five results; another account reusing the id was refused; a failed recording
// left no request row and its retry succeeded. These checks keep the file from drifting.
describe('SQL60 record_match_result_once', () => {
  it('claims the request id before recording, and returns the first result on a repeat', () => {
    const body = migration.slice(migration.indexOf('create function public.record_match_result_once'))
    const claim = body.indexOf('insert into public.match_result_submissions (request_id, requested_by, tournament_id) values (p_request_id, v_user, p_tournament_id) on conflict (request_id) do nothing;')
    const record = body.indexOf('v_match := public.record_match_result_safely(')
    expect(claim).toBeGreaterThan(-1)
    expect(record).toBeGreaterThan(claim)
    expect(body).toContain('if not found then select s.requested_by, s.match_result_id into v_by, v_match')
    expect(body).toContain("raise exception 'REQUEST_ID_TAKEN'")
    expect(body).toContain("security definer set search_path = ''")
  })

  it('keeps the submissions table away from clients', () => {
    expect(migration).toContain('alter table public.match_result_submissions enable row level security;')
    expect(migration).toContain('revoke all on public.match_result_submissions from public, anon, authenticated;')
    expect(migration).not.toMatch(/create policy/i)
  })

  it('lets signed-in organizers call it, never anonymous visitors', () => {
    expect(migration).toContain('revoke all on function public.record_match_result_once(uuid, uuid, uuid, uuid, integer, integer, jsonb) from public, anon, authenticated;')
    expect(migration).toContain('grant execute on function public.record_match_result_once(uuid, uuid, uuid, uuid, integer, integer, jsonb) to authenticated, service_role;')
  })

  it('checks itself and rolls back on any mismatch', () => {
    expect(raw).toMatch(/^begin;/m)
    expect(raw).toMatch(/^commit;\s*$/m)
    expect(migration).toContain("raise exception 'SQL60 function privileges are wrong'")
    expect(migration).toContain("raise exception 'SQL60 left match_result_submissions open to clients'")
  })

  it.each(['60-match-result-request-id-precheck.sql', '60-match-result-request-id-postcheck.sql'])('%s only reads', name => {
    expect(code(name)).toMatch(/\bselect\b/i)
    expect(code(name)).not.toMatch(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate|do)\b/im)
  })
})
