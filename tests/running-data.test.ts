import { describe, expect, it } from 'vitest'
import { RUN_PAGE_SIZE, fetchMyRunning } from '@/lib/running-data'

type Answer = { data: unknown; error: { code?: string; message: string } | null }

// A stand-in for supabase-js that records the range asked for and answers from a script.
function fakeClient(answers: { runs?: Answer; weeks?: Answer; goal?: Answer }) {
  const asked: string[] = []
  const settle = (answer?: Answer) => Promise.resolve(answer ?? { data: null, error: null })
  const chain = (table: string): Record<string, unknown> => {
    const self: Record<string, unknown> = {}
    self.select = () => self
    self.eq = (column: string, value: unknown) => { asked.push(`${table} ${column}=${value}`); return self }
    self.order = () => self
    self.range = (start: number, end: number) => { asked.push(`range ${start}-${end}`); return settle(answers.runs) }
    self.maybeSingle = () => settle(answers.goal)
    return self
  }
  const client = { from: (table: string) => chain(table), rpc: (name: string, args: unknown) => { asked.push(`rpc ${name} ${JSON.stringify(args)}`); return settle(answers.weeks) } }
  return { client: client as never, asked }
}

describe('the running tab data', () => {
  it('reads one page of the account\'s own runs and says whether there is another', async () => {
    const rows = Array.from({ length: RUN_PAGE_SIZE + 1 }, (_, index) => ({ id: `r${index}`, run_date: '2026-11-25', distance_m: 5000, duration_s: 1800 }))
    const { client, asked } = fakeClient({ runs: { data: rows, error: null }, weeks: { data: [{ week_start: '2026-11-23', runs: 2, distance_m: 8000, duration_s: 3000 }], error: null }, goal: { data: { unit: 'km', target: 15 }, error: null } })
    const running = await fetchMyRunning(client, 'u1', 2)
    expect(asked).toContain(`range ${RUN_PAGE_SIZE}-${RUN_PAGE_SIZE * 2}`)
    expect(asked).toContain('run_logs user_id=u1')
    expect(asked).toContain('rpc my_run_weeks {"p_weeks":53}')
    expect(running.runs).toHaveLength(RUN_PAGE_SIZE)
    expect(running.hasNext).toBe(true)
    expect(running.weeks).toEqual([{ weekStart: '2026-11-23', runs: 2, distanceM: 8000, durationS: 3000 }])
    expect(running.goal).toEqual({ unit: 'km', target: 15 })
  })

  it('says the feature is not there yet before sql/108, and fails on any other error', async () => {
    const missing = fakeClient({ runs: { data: null, error: { code: 'PGRST205', message: 'no table' } } })
    expect((await fetchMyRunning(missing.client, 'u1', 1)).available).toBe(false)
    const broken = fakeClient({ runs: { data: null, error: { code: '57014', message: 'timeout' } } })
    await expect(fetchMyRunning(broken.client, 'u1', 1)).rejects.toMatchObject({ code: '57014' })
  })
})
