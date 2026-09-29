import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../sql/61-first-match-rank-v1.sql', import.meta.url), 'utf8')
  .split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n').replace(/\s+/g, ' ')

// player_ranks_player_sport_season_idx is a PARTIAL unique index (where player_id is not
// null; sql/link-player-ranks-to-profiles.sql, sql/athlete-profile-v2.sql). ON CONFLICT
// only infers a partial index when it repeats the predicate; without it every first-match
// rank insert failed with "there is no unique or exclusion constraint matching the ON
// CONFLICT specification" (reproduced on Postgres 16 with the real index definition).
describe('SQL61 first-match rank', () => {
  it('names the partial unique index predicate in its conflict target', () => {
    expect(sql).toContain('on conflict (player_id, sport, season) where player_id is not null do nothing')
  })

  it('creates rows only for a public profile and a roster member, after the organizer check', () => {
    const body = sql.slice(sql.indexOf('create function public.record_match_result_first_rank'))
    expect(body.indexOf("raise exception 'FORBIDDEN'")).toBeLessThan(body.indexOf('insert into public.player_ranks'))
    expect(body.indexOf("raise exception 'NOT_ON_ROSTER'")).toBeLessThan(body.indexOf('insert into public.player_ranks'))
    expect(body.indexOf("raise exception 'ATHLETE_NOT_PUBLIC'")).toBeLessThan(body.indexOf('insert into public.player_ranks'))
    expect(body).toContain('and a.is_public;')
  })
})
