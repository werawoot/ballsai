import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { drawTables, type StoredDraw, type StoredFixture } from '@/lib/fixture-draw'

// A draw as a reader sees it: a table per group or league, then every fixture by stage
// and round with its score. The organizer's page adds penalty controls through
// `renderExtra`; the public page shows it as it is. Not async, like Pagination, so
// server and client pages can both render it.
export default function FixtureBoard({ draw, renderExtra }: { draw: StoredDraw; renderExtra?: (fixture: StoredFixture) => ReactNode }) {
  const t = useTranslations('fixtures')

  const side = (teamId: string | null, source: string | null) => {
    if (teamId) return draw.teamNames[teamId] ?? '—'
    const [kind, ...rest] = (source ?? '').split(':')
    if (kind === 'winner') {
      // Keys read KO-R2-M1; readers see "round 2, match 1", not the key.
      const [, round = '?', match = '?'] = rest[0]?.match(/R(\d+)-M(\d+)$/) ?? []
      return t('winnerOf', { round, match })
    }
    if (kind === 'group') return t('groupPlace', { group: rest[0], position: rest[1] })
    return '—'
  }
  // A linked result, turned to this fixture's home and away (results store team A and B).
  const score = (fixture: StoredFixture) => {
    const result = fixture.match_result_id ? draw.results[fixture.match_result_id] : undefined
    if (!result || result.status !== 'confirmed') return null
    const homeIsA = result.team_a_id === fixture.home_team_id
    return { home: homeIsA ? result.team_a_score : result.team_b_score, away: homeIsA ? result.team_b_score : result.team_a_score }
  }

  const tables = drawTables(draw)
  const sections = new Map<string, StoredFixture[]>()
  for (const fixture of draw.fixtures) {
    const title = fixture.stage === 'group' ? t('stageGroup', { group: fixture.group_label ?? '' }) : fixture.stage === 'league' ? t('stageLeague') : t('stageKnockout')
    const key = `${title} · ${t('round', { round: fixture.round })}`
    sections.set(key, [...(sections.get(key) ?? []), fixture])
  }
  // Numbers and their short headers never wrap; only the team name column may.
  const cell = { padding: '6px 3px', textAlign: 'right', whiteSpace: 'nowrap' } as const
  const card = { background: 'white', borderRadius: 14, border: '1.5px solid #e5e5e5', padding: '12px 14px' } as const

  return <>
    {tables.map(table => {
      const title = table.group ? t('tableGroup', { group: table.group }) : t('tableLeague')
      return (
        <section key={table.key} aria-label={title} style={{ ...card, overflowX: 'auto' }}>
          <h2 style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, color: '#111827', margin: '0 0 6px' }}>{title}</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ color: '#888' }}>
              <th scope="col" style={{ ...cell, textAlign: 'left' }}>{t('colTeam')}</th>
              <th scope="col" style={cell}>{t('colPlayed')}</th><th scope="col" style={cell}>{t('colWon')}</th>
              <th scope="col" style={cell}>{t('colDrawn')}</th><th scope="col" style={cell}>{t('colLost')}</th>
              <th scope="col" style={cell}>{t('colGoalDifference')}</th><th scope="col" style={cell}>{t('colPoints')}</th>
            </tr></thead>
            <tbody>{table.rows.map((row, index) => (
              <tr key={row.teamId} style={{ borderTop: '1px solid #f0f0f0' }}>
                <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 700, whiteSpace: 'normal', overflowWrap: 'break-word', minWidth: 88 }}>{`${index + 1}. ${draw.teamNames[row.teamId] ?? '—'}`}</th>
                <td style={cell}>{row.played}</td><td style={cell}>{row.won}</td><td style={cell}>{row.drawn}</td>
                <td style={cell}>{row.lost}</td><td style={cell}>{row.goalDifference}</td><td style={{ ...cell, fontWeight: 800 }}>{row.points}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )
    })}
    {[...sections].map(([title, fixtures]) => (
      <section key={title} aria-label={title} style={card}>
        <h2 style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, color: '#CC0001', margin: '0 0 8px' }}>{title}</h2>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {fixtures.map(fixture => {
            const played = score(fixture)
            const penalties = fixture.stage === 'knockout' && played !== null && played.home === played.away
            const mark = (teamId: string | null) => penalties && teamId && fixture.winner_team_id === teamId ? ` (${t('wonOnPenalties')})` : ''
            return (
              <li key={fixture.fixture_key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', gap: 8, alignItems: 'center', fontSize: 13, padding: '8px 0', borderTop: '1px solid #f0f0f0' }}>
                <span style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{`${side(fixture.home_team_id, fixture.home_source)}${mark(fixture.home_team_id)}`}</span>
                {played
                  ? <span style={{ fontFamily: 'var(--font-oswald)', fontWeight: 800, fontSize: 15 }}>{`${played.home} – ${played.away}`}</span>
                  : <span style={{ color: '#aaa', fontSize: 11 }}>{t('versus')}</span>}
                <span style={{ fontWeight: 700, textAlign: 'right', overflowWrap: 'anywhere' }}>{`${side(fixture.away_team_id, fixture.away_source)}${mark(fixture.away_team_id)}`}</span>
                {penalties && !fixture.winner_team_id && renderExtra?.(fixture)}
              </li>
            )
          })}
        </ol>
      </section>
    ))}
  </>
}
