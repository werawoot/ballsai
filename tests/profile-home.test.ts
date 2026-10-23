import { describe, expect, it } from 'vitest'
import { fetchProfileHome } from '@/lib/profile-home'

// T59: /profile sent ten reads in three waves. my_profile_home (sql/91) answers them in one
// call; before it is applied the page keeps its old separate reads.
type Answer = { data: unknown; error: { code?: string } | null; count?: number | null }

function fakeSupabase(rpcAnswers: Record<string, Answer>, tables: Record<string, Record<string, unknown>[]> = {}) {
  const calls: string[] = []
  const from = (table: string) => {
    calls.push(table)
    let rows = tables[table] ?? []
    let head = false
    const builder: Record<string, unknown> = {
      select: (_columns: string, options?: { head?: boolean }) => { head = Boolean(options?.head); return builder },
      eq: (column: string, value: unknown) => { rows = rows.filter(row => row[column] === value); return builder },
      gte: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: head ? null : rows, count: rows.length, error: null }).then(resolve),
    }
    return builder
  }
  const rpc = async (fn: string) => { calls.push(`rpc:${fn}`); return rpcAnswers[fn] ?? { data: null, error: { code: 'PGRST202' } } }
  return { client: { from, rpc } as never, calls }
}

const U = '11111111-1111-4111-8111-111111111111'
const home = {
  profile: { full_name: 'Nong A', role: 'user', onboarding_persona: 'athlete' },
  athlete: { user_id: U, display_name: 'Nong A', is_public: true, verification_level: 'self', profile_image_url: null },
  private: { birth_date: '2012-05-01', guardian_consent_at: '2026-10-01T00:00:00Z' },
  rank: { id: 'r1', player_name: 'Nong A', position: 'FW', ovr: 70, pts: 900 },
  progress: { xp_total: 340, current_level: 3 },
  highlights: 2, videos: 1, pending_guardian: 1,
  memberships: [{ member_id: 'm1', team_id: 't1', status: 'pending', invited_at: null, created_at: '2026-10-18T00:00:00Z', team_name: 'Tigers U13', team_status: 'confirmed', team_kind: 'club', tournament_name: null, tournament_location: null }],
  training: { enrollments: [{ id: 'e1', program_id: 'u13-basics', weekdays: [1, 3], start_date: '2026-10-01', status: 'active' }], checkins: [{ enrollment_id: 'e1', session_date: '2026-10-06' }, { enrollment_id: 'e1', session_date: '2026-10-08' }] },
}

describe("the athlete's own /profile data", () => {
  it('comes from my_profile_home in one call, in the shape the page uses', async () => {
    const { client, calls } = fakeSupabase({ my_profile_home: { data: home, error: null } })
    const result = await fetchProfileHome(client, U)
    expect(calls).toEqual(['rpc:my_profile_home'])
    expect(result.profile?.full_name).toBe('Nong A')
    expect(result.athlete?.display_name).toBe('Nong A')
    expect(result.private).toEqual({ birth_date: '2012-05-01', guardian_consent_at: '2026-10-01T00:00:00Z' })
    expect(result.rank?.pts).toBe(900)
    expect(result.progress?.xp_total).toBe(340)
    expect([result.highlights, result.videos, result.pendingGuardian]).toEqual([2, 1, 1])
    expect(result.memberships[0]).toMatchObject({ id: 'm1', status: 'pending', teams: { name: 'Tigers U13' } })
    expect(result.training).toEqual({ available: true, enrollments: home.training.enrollments, checkins: { e1: ['2026-10-06', '2026-10-08'] } })
  })

  it('falls back to the separate reads, same answer, while sql/91 is not applied', async () => {
    const { client, calls } = fakeSupabase({
      my_athlete_private: { data: [home.private], error: null },
      my_team_memberships: { data: home.memberships, error: null },
    }, {
      profiles: [{ id: U, ...home.profile }],
      athlete_profiles: [home.athlete],
      player_ranks: [{ ...home.rank, player_id: U, sport: 'football', season: '2026' }],
      athlete_progress: [{ athlete_id: U, ...home.progress }],
      athlete_highlights: [{ athlete_id: U }, { athlete_id: U }],
      athlete_videos: [{ athlete_id: U }],
      guardian_links: [{ athlete_id: U, status: 'pending' }, { athlete_id: U, status: 'approved' }],
      training_enrollments: home.training.enrollments.map(row => ({ ...row, athlete_id: U })),
      training_checkins: home.training.checkins.map(row => ({ ...row, athlete_id: U })),
    })
    const result = await fetchProfileHome(client, U)
    expect(calls[0]).toBe('rpc:my_profile_home')
    expect(calls.length).toBeGreaterThan(5)
    expect(result.athlete?.display_name).toBe('Nong A')
    expect(result.private).toEqual(home.private)
    expect(result.rank?.pts).toBe(900)
    expect([result.highlights, result.videos, result.pendingGuardian]).toEqual([2, 1, 1])
    expect(result.memberships[0]?.teams?.name).toBe('Tigers U13')
    expect(result.training.checkins).toEqual({ e1: ['2026-10-06', '2026-10-08'] })
  })

  // A timeout is not "the function is missing": ten more reads would only add to the load.
  it('throws when my_profile_home fails for another reason, instead of reading ten times more', async () => {
    const { client, calls } = fakeSupabase({ my_profile_home: { data: null, error: { code: '57014' } } })
    await expect(fetchProfileHome(client, U)).rejects.toMatchObject({ code: '57014' })
    expect(calls).toEqual(['rpc:my_profile_home'])
  })
})
