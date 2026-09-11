/**
 * Regression test for the accepted-roster rule: invite -> accept -> only accepted
 * members are selectable -> a match result built from them passes the same check the
 * database applies in record_match_result_safely.
 *
 * Runs the real lib/team-roster.ts (transpiled with the TypeScript compiler already in
 * devDependencies, executed in a VM) so this exercises shipped code, not a copy. No
 * test framework is added — this uses the Node test runner, matching the other
 * scripts/*.mjs checks in this repo.
 *
 *   node --test scripts/team-roster.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'
import vm from 'node:vm'

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const require = createRequire(`${root}/package.json`)
const ts = require('typescript')

function loadModule(relativePath) {
  const source = readFileSync(`${root}/${relativePath}`, 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, console, require: () => { throw new Error('no imports expected') } })
  return exports
}

const { acceptedRosterKeys, buildRosterPlayers, rosterForTeam, rosterMismatches, rosterKey } =
  loadModule('lib/team-roster.ts')

const TEAM_A = 'team-a'
const TEAM_B = 'team-b'
const ATHLETE_A = 'athlete-a'
const ATHLETE_B = 'athlete-b'
const OUTSIDER = 'athlete-outsider'

const ranked = [
  { id: 'rank-a', player_id: ATHLETE_A, player_name: 'สมชาย', position: 'CM', pts: 1200 },
  { id: 'rank-b', player_id: ATHLETE_B, player_name: 'สมหญิง', position: 'ST', pts: 1150 },
  { id: 'rank-outsider', player_id: OUTSIDER, player_name: 'คนนอก', position: 'GK', pts: 1300 },
  { id: 'rank-unlinked', player_id: null, player_name: 'อันดับเก่าไม่ผูกบัญชี', position: 'CB', pts: 1100 },
]

/** The membership rows that exist after an invite has been accepted. */
const acceptedAfterInvite = [
  { team_id: TEAM_A, athlete_id: ATHLETE_A },
  { team_id: TEAM_B, athlete_id: ATHLETE_B },
]

describe('after invite -> accept, only accepted members are selectable', () => {
  it('offers an accepted athlete on their own team', () => {
    const players = buildRosterPlayers(acceptedAfterInvite, ranked)
    const teamARoster = rosterForTeam(players, TEAM_A)

    assert.equal(teamARoster.length, 1)
    assert.equal(teamARoster[0].id, 'rank-a')
    assert.equal(teamARoster[0].team_id, TEAM_A)
  })

  it('does not offer an athlete whose invite is still pending or was declined', () => {
    // A pending/declined/removed row is simply not in the accepted list the page loads.
    const players = buildRosterPlayers([], ranked)
    assert.equal(players.length, 0)
    assert.equal(rosterForTeam(players, TEAM_A).length, 0)
  })

  it('does not offer an accepted athlete on the other team', () => {
    const players = buildRosterPlayers(acceptedAfterInvite, ranked)
    const teamARoster = rosterForTeam(players, TEAM_A)
    assert.ok(!teamARoster.some(player => player.player_id === ATHLETE_B), 'team B member must not appear under team A')
  })

  it('offers nobody until a team is chosen', () => {
    const players = buildRosterPlayers(acceptedAfterInvite, ranked)
    assert.equal(rosterForTeam(players, '').length, 0, 'no team chosen means no athletes offered')
  })

  it('skips an accepted member with no ranking row for the active season', () => {
    const players = buildRosterPlayers([{ team_id: TEAM_A, athlete_id: 'athlete-without-rank' }], ranked)
    assert.equal(players.length, 0, 'the rating transaction has nothing to update for them')
  })

  it('never offers a ranking row that is not linked to an account', () => {
    const players = buildRosterPlayers([{ team_id: TEAM_A, athlete_id: ATHLETE_A }], ranked)
    assert.ok(!players.some(player => player.id === 'rank-unlinked'))
  })
})

describe('match-result submission is checked against the same roster', () => {
  const accepted = acceptedRosterKeys(acceptedAfterInvite)

  it('accepts a submission built from the accepted roster', () => {
    const performances = [
      { playerRankId: 'rank-a', teamId: TEAM_A },
      { playerRankId: 'rank-b', teamId: TEAM_B },
    ]
    assert.equal(rosterMismatches(performances, ranked, accepted).length, 0)
  })

  it('rejects an athlete recorded under the wrong team', () => {
    const performances = [{ playerRankId: 'rank-a', teamId: TEAM_B }]
    assert.equal(rosterMismatches(performances, ranked, accepted).length, 1)
  })

  it('rejects an athlete with no accepted membership at all', () => {
    const performances = [{ playerRankId: 'rank-outsider', teamId: TEAM_A }]
    assert.equal(rosterMismatches(performances, ranked, accepted).length, 1)
  })

  it('rejects a ranking row with no linked account', () => {
    const performances = [{ playerRankId: 'rank-unlinked', teamId: TEAM_A }]
    assert.equal(rosterMismatches(performances, ranked, accepted).length, 1)
  })

  it('rejects a performance with no team selected', () => {
    const performances = [{ playerRankId: 'rank-a', teamId: '' }]
    assert.equal(rosterMismatches(performances, ranked, accepted).length, 1)
  })

  it('reports every offending row, not just the first', () => {
    const performances = [
      { playerRankId: 'rank-a', teamId: TEAM_A },
      { playerRankId: 'rank-outsider', teamId: TEAM_A },
      { playerRankId: 'rank-b', teamId: TEAM_A },
    ]
    assert.equal(rosterMismatches(performances, ranked, accepted).length, 2)
  })

  it('keys membership by team and athlete together', () => {
    assert.equal(rosterKey(TEAM_A, ATHLETE_A), `${TEAM_A}:${ATHLETE_A}`)
    assert.ok(accepted.has(rosterKey(TEAM_A, ATHLETE_A)))
    assert.ok(!accepted.has(rosterKey(TEAM_B, ATHLETE_A)))
  })
})

describe('a removed member loses access going forward', () => {
  it('drops out of the roster and fails a new submission', () => {
    // remove_team_member sets status='removed', so the accepted query no longer
    // returns the row. Already-recorded matches keep their snapshot (DB-side).
    const afterRemoval = acceptedAfterInvite.filter(member => member.athlete_id !== ATHLETE_A)
    const players = buildRosterPlayers(afterRemoval, ranked)
    assert.equal(rosterForTeam(players, TEAM_A).length, 0)
    assert.equal(
      rosterMismatches([{ playerRankId: 'rank-a', teamId: TEAM_A }], ranked, acceptedRosterKeys(afterRemoval)).length,
      1,
    )
  })
})

describe('request -> approve -> eligible -> remove -> ineligible', () => {
  /**
   * Mirrors the membership rows each approved RPC leaves behind
   * (sql/24-team-roster-integrity-v1.sql), then asks the shipped helpers what the
   * organizer may select at each step. No direct team_members write exists in the
   * app: every transition below is an RPC result.
   */
  const acceptedOnly = rows => rows.filter(row => row.status === 'accepted').map(row => ({ team_id: row.team_id, athlete_id: row.athlete_id }))
  const eligible = rows => rosterForTeam(buildRosterPlayers(acceptedOnly(rows), ranked), TEAM_A)
  const submit = rows => rosterMismatches(
    [{ playerRankId: 'rank-a', teamId: TEAM_A }],
    ranked,
    acceptedRosterKeys(acceptedOnly(rows)),
  )

  it('walks the whole lifecycle', () => {
    // 1. request_team_membership: pending, direction 'request'.
    let rows = [{ id: 'm1', team_id: TEAM_A, athlete_id: ATHLETE_A, status: 'pending', direction: 'request' }]
    assert.equal(eligible(rows).length, 0, 'a pending request grants no eligibility')
    assert.equal(submit(rows).length, 1, 'and a match result for them is rejected')

    // 2. approve_team_request: accepted.
    rows = rows.map(row => ({ ...row, status: 'accepted' }))
    assert.equal(eligible(rows).length, 1, 'approval makes the athlete selectable')
    assert.equal(eligible(rows)[0].id, 'rank-a')
    assert.equal(submit(rows).length, 0, 'and the match result passes the roster check')

    // 3. remove_team_member: removed, immediately.
    rows = rows.map(row => ({ ...row, status: 'removed' }))
    assert.equal(eligible(rows).length, 0, 'a removed member disappears from the picker at once')
    assert.equal(submit(rows).length, 1, 'and can no longer be recorded in a new match')
  })

  it('declining a request leaves the athlete ineligible', () => {
    const rows = [{ id: 'm1', team_id: TEAM_A, athlete_id: ATHLETE_A, status: 'declined', direction: 'request' }]
    assert.equal(eligible(rows).length, 0)
    assert.equal(submit(rows).length, 1)
  })

  it('keeps invite and request rows behaving identically once accepted', () => {
    const fromInvite = [{ id: 'm1', team_id: TEAM_A, athlete_id: ATHLETE_A, status: 'accepted', direction: 'invite' }]
    const fromRequest = [{ id: 'm2', team_id: TEAM_A, athlete_id: ATHLETE_A, status: 'accepted', direction: 'request' }]
    assert.equal(eligible(fromInvite).length, eligible(fromRequest).length)
    assert.equal(submit(fromInvite).length, submit(fromRequest).length)
  })

  it('a rejoin after removal restores eligibility without touching the old period', () => {
    // The partial-unique index allows a fresh row once the old one is 'removed'.
    const history = [
      { id: 'm1', team_id: TEAM_A, athlete_id: ATHLETE_A, status: 'removed', direction: 'invite' },
      { id: 'm2', team_id: TEAM_A, athlete_id: ATHLETE_A, status: 'accepted', direction: 'request' },
    ]
    assert.equal(eligible(history).length, 1, 'the new accepted period counts')
    assert.equal(submit(history).length, 0)
    assert.equal(history.filter(row => row.status === 'removed').length, 1, 'the earlier period is still on record')
  })
})
