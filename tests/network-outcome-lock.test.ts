import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// A mutating request that loses its response leaves this tab unable to say whether the
// write landed. Every screen that reacts to that must lock the control that would repeat
// it. The lock was first written as a `useRef` alone, which is invisible to React: the
// button kept rendering as pressable and the handler returned early, so a press did
// nothing at all and said nothing. These tests hold the seam: the ref may refuse the
// click, but a state value is what must decide `disabled`.

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8')

const walk = (dir: string): string[] =>
  readdirSync(`${root}${dir}`).flatMap(entry => {
    const path = `${dir}/${entry}`
    if (statSync(`${root}${path}`).isDirectory()) return walk(path)
    return path.endsWith('.tsx') ? [path] : []
  })

const LOCK_FILES = walk('app').filter(path => /outcomeUnknown|needsReload|ShortlistRecovery/.test(read(path)))

// Several of these screens are written as one long line, so a line-level match would
// catch the handler's own `outcomeUnknown.current` guard as well. Pull out just the
// `disabled={...}` expressions, which is the only place a ref read actually misleads.
const disabledExpressions = (source: string) => source.match(/disabled[=:]\s*\{?[^}\n]*/g) ?? []

describe('unknown-outcome locks', () => {
  it('finds every screen that locks on an unknown outcome', () => {
    // A guard against the walk silently matching nothing after a rename.
    expect(LOCK_FILES.length).toBeGreaterThanOrEqual(12)
  })

  describe.each(LOCK_FILES)('%s', file => {
    const source = () => read(file)

    it('never decides `disabled` from a ref, which does not re-render', () => {
      const offenders = disabledExpressions(source())
        .filter(expression => /\w+\.current/.test(expression))
      expect(offenders).toEqual([])
    })

    it('backs the lock with a state setter so the control actually re-renders', () => {
      expect(source()).toMatch(/setNeedsReload\(|setOutcomeUnknown\(|setShortlistRecovery\(/)
    })

    it('renders a way to re-read server state instead of leaving a dead control', () => {
      // The locked control is unusable by design; something next to it has to offer the
      // way out, and it has to appear only while the lock is on.
      expect(source()).toMatch(/needsReload\s*&&|outcomeUnknown\s*&&|canReloadRow\(/)
      expect(source()).toMatch(/window\.location\.reload\(\)|router\.refresh\(\)|checkRow\(/)
    })
  })
})

describe('scout shortlist recovery', () => {
  const SCOUT = 'app/scout/ScoutClient.tsx'
  const SQL = 'sql/25-scout-shortlists-v1.sql'

  it('rests on an upsert against a unique row, not on an assumption', () => {
    // The per-row retry below is only safe because repeating either call cannot create
    // a second row. If this migration ever loses the constraint or the upsert, the
    // recovery design in ScoutClient has to be revisited with it.
    const sql = read(SQL)
    expect(sql).toContain('unique(scout_id, athlete_id)')
    expect(sql).toContain('on conflict (scout_id, athlete_id) do update')
    expect(sql).toMatch(/delete from public\.scout_shortlists\s+where scout_id = auth\.uid\(\)/)
  })

  it('marks the one athlete it could not account for, not the whole board', () => {
    const source = read(SCOUT)
    expect(source).toContain('setShortlistRecovery(state => markOutcomeUnknown(state, athleteId))')
    expect(source).toContain('canWriteRow(recovery, athleteId)')
  })

  it('reads that one row back from the server instead of reloading the page', () => {
    const source = read(SCOUT)
    expect(source).toContain('`/api/scout-shortlist?athleteId=${encodeURIComponent(athleteId)}`')
    expect(source).toContain('โหลดสถานะใหม่')
    expect(source).not.toContain('window.location.reload()')
    expect(source).not.toContain('router.refresh()')
  })

  it('never lets the checking label gate a control', () => {
    // isChecking may pick a label. The moment it reaches a `disabled`, a read-back that
    // hangs takes away the only way out of the lock.
    const source = read(SCOUT)
    expect(source).not.toMatch(/disabled=\{[^}]*isChecking/)
    expect(source).not.toMatch(/disabled=\{[^}]*checking/)
  })

  it('drops a reply that a later press has superseded', () => {
    const source = read(SCOUT)
    expect(source).toContain('const claimed = recordAttempt(attempts.current, athleteId)')
    expect(source).toContain('if (!isLatestAttempt(attempts.current, athleteId, claimed.attempt)) return')
  })

  it('validates the body before it is allowed to unlock anything', () => {
    // A 2xx with an unreadable body arrives as `{ ok: true, data: null }`. It must go
    // down the same path as a failure, not be read as "this athlete is not saved".
    const source = read(SCOUT)
    expect(source).toContain('const row = result.ok ? parseShortlistRow(result.data, athleteId) : null')
    const parseIndex = source.indexOf('parseShortlistRow(result.data, athleteId)')
    const resolveIndex = source.indexOf('resolveCheck(state, athleteId)')
    expect(parseIndex).toBeGreaterThan(-1)
    expect(resolveIndex).toBeGreaterThan(parseIndex)
    // No optional-chaining fallback that would let a missing row mean "not saved".
    expect(source).not.toMatch(/row\?\.saved/)
  })

  it('unlocks on success only, and keeps the row on a failed read-back', () => {
    const source = read(SCOUT)
    const failIndex = source.indexOf('setShortlistRecovery(state => failCheck(state, athleteId))')
    const resolveIndex = source.indexOf('setShortlistRecovery(state => resolveCheck(state, athleteId))')
    expect(failIndex).toBeGreaterThan(-1)
    expect(resolveIndex).toBeGreaterThan(failIndex)
  })

  it('adopts new props as data without unlocking anything', () => {
    const source = read(SCOUT)
    expect(source).toContain('useEffect(() => { setShortlist(initialShortlist) }, [initialShortlist])')
  })

  it('keeps the read-back free of anything that writes', () => {
    const route = read('app/api/scout-shortlist/route.ts')
    const getBody = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'))
    expect(getBody).not.toContain('.rpc(')
    expect(getBody).toContain(".eq('scout_id', user.id)")
  })

  it('still reports a server error with the server\'s own words', () => {
    expect(read(SCOUT)).toContain('requestErrorText(result, { fallback: \'ดำเนินการไม่สำเร็จ\' })')
  })
})

describe('guardian link revocation copy', () => {
  const GUARDIAN = 'app/guardian/GuardianLinksClient.tsx'

  // `revoke_guardian_link` clears `guardian_consent_at` and sets `is_public = false`
  // when the revoked link was the last accepted one. A guardian pressing "ยกเลิก" is
  // therefore able to take a minor's public profile offline, and must be told so.
  it('names the public-profile consequence before the request is sent', () => {
    const source = read(GUARDIAN)
    const confirmIndex = source.indexOf('window.confirm(')
    const requestIndex = source.indexOf("requestJson(`/api/guardian-links/${id}`, { method: 'DELETE' })")
    expect(confirmIndex).toBeGreaterThan(-1)
    expect(requestIndex).toBeGreaterThan(confirmIndex)
    expect(source).toContain('โปรไฟล์สาธารณะของนักกีฬาจะถูกปิด')
  })

  it('does not hide the consequence in the success message either', () => {
    const source = read(GUARDIAN)
    const success = source
      .split('\n')
      .find(line => line.includes("setMessage('ยกเลิกการเชื่อมบัญชีแล้ว"))
    expect(success).toBeDefined()
    expect(success).toContain('โปรไฟล์สาธารณะ')
  })

  it('keeps the SQL that this copy describes', () => {
    const sql = read('sql/21-guardian-links-v1.sql')
    expect(sql).toContain('update public.athlete_profiles set guardian_consent_at = null, is_public = false')
  })
})
