import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Trophy } from 'lucide-react'
import { drawTables, type DrawTable, type StoredDraw, type StoredFixture } from '@/lib/fixture-draw'
import { drawProgress, groupLabels, hasKnockout, knockoutRoundName, knockoutRounds, matchNumber, qualifyingPlaces, teamBadge, viewFixture } from '@/lib/fixture-view'
import './fixture-board.css'

// A draw as a reader sees it. With `nav` (the public page) it is three views -- fixtures,
// tables, knockout bracket -- with a group filter, and on a wide screen the tables sit
// beside the fixtures. Without it (the organizer's page) everything is on one page and
// `renderExtra` adds the penalty controls. Not async, like Pagination, so server and
// client pages can both render it.

export type BoardView = 'fixtures' | 'tables' | 'bracket'
export type BoardNav = { view: BoardView; filter: string; round?: string; href: (view: BoardView, filter?: string, round?: string) => string }

// More fixtures than this on one screen and the page shows one round at a time: a 64-team
// league is 2,016 matches (3 MB of HTML on a phone); one matchday of it is 32.
export const ROUND_PAGE_LIMIT = 48

export function boardViews(draw: StoredDraw): BoardView[] {
  return ['fixtures', ...(drawTables(draw).length ? ['tables' as const] : []), ...(hasKnockout(draw) ? ['bracket' as const] : [])]
}

export default function FixtureBoard({ draw, renderExtra, nav }: { draw: StoredDraw; renderExtra?: (fixture: StoredFixture) => ReactNode; nav?: BoardNav }) {
  const t = useTranslations('fixtures')
  const totalRounds = knockoutRounds(draw)
  const roundLabel = (round: number) => {
    const name = knockoutRoundName(round, totalRounds)
    return name.key === 'roundOf' ? t('roundOf', { teams: name.teams }) : t(`round${name.key[0].toUpperCase()}${name.key.slice(1)}` as 'roundFinal')
  }
  const name = (teamId: string | null) => (teamId && draw.teamNames[teamId]) || '—'
  const source = (value: string | null) => {
    const [kind, ...rest] = (value ?? '').split(':')
    if (kind === 'winner') {
      // Keys read KO-R2-M1; readers see "winner of the semi-final, match 1", not the key.
      const [, round = '0', match = '?'] = rest[0]?.match(/R(\d+)-M(\d+)$/) ?? []
      return t('winnerOf', { round: roundLabel(Number(round)), match })
    }
    if (kind === 'group') return t('groupPlace', { group: rest[0], position: rest[1] })
    return '—'
  }
  const sectionTitle = (fixture: StoredFixture) => fixture.stage === 'knockout'
    ? roundLabel(fixture.round)
    : `${fixture.stage === 'group' ? t('stageGroup', { group: fixture.group_label ?? '' }) : t('stageLeague')} · ${t('matchday', { round: fixture.round })}`
  const places = qualifyingPlaces(draw)
  const tables = drawTables(draw)

  const side = (fixture: StoredFixture, which: 'home' | 'away', winnerId: string | null, played: boolean) => {
    const teamId = which === 'home' ? fixture.home_team_id : fixture.away_team_id
    if (!teamId) return <span className="fx-team is-source">{source(which === 'home' ? fixture.home_source : fixture.away_source)}</span>
    const badge = teamBadge(name(teamId))
    const tone = !played || !winnerId ? '' : winnerId === teamId ? ' is-win' : ' is-lose'
    return <span className={`fx-team${tone}`}><span className="fx-badge" style={{ background: badge.colour }} aria-hidden="true">{badge.initials}</span><span className="fx-name">{name(teamId)}</span></span>
  }

  const match = (fixture: StoredFixture) => {
    const view = viewFixture(draw, fixture)
    const played = view.score !== null
    const status = view.status === 'pending' ? t('statusPending') : view.status === 'drawn' ? t('statusDrawn') : view.status === 'penalties' ? t('wonOnPenalties') : t('statusDone')
    const label = fixture.stage === 'knockout' ? roundLabel(fixture.round) : fixture.stage === 'group' ? t('stageGroup', { group: fixture.group_label ?? '' }) : t('stageLeague')
    return (
      <li key={fixture.fixture_key} className="fx-match">
        {side(fixture, 'home', view.winnerId, played)}
        {played ? <span className={`fx-score${view.winnerId && view.winnerId !== fixture.home_team_id ? ' is-lose' : ''}`}>{view.score!.home}</span> : <span className="fx-vs">{t('notPlayed')}</span>}
        {side(fixture, 'away', view.winnerId, played)}
        {played && <span className={`fx-score${view.winnerId && view.winnerId !== fixture.away_team_id ? ' is-lose' : ''}`}>{view.score!.away}</span>}
        <span className="fx-foot">
          <span>{label}</span>
          {view.status === 'penalties' && view.winnerId
            ? <span className="fx-status is-pen">{t('penaltiesWinner', { team: name(view.winnerId) })}</span>
            : <span className={`fx-status is-${view.status === 'pending' ? 'wait' : 'done'}`}>{view.status === 'penalties' ? t('penaltiesPending') : status}</span>}
        </span>
        {view.status === 'penalties' && !fixture.winner_team_id && renderExtra?.(fixture)}
      </li>
    )
  }

  const sections = (fixtures: StoredFixture[]) => {
    const grouped = new Map<string, StoredFixture[]>()
    for (const fixture of fixtures) {
      const key = sectionTitle(fixture)
      grouped.set(key, [...(grouped.get(key) ?? []), fixture])
    }
    return [...grouped].map(([title, list]) => (
      <section key={title} aria-label={title} className="fx-section">
        <h2 className="fx-section-title"><b>{title}</b><small>{t('matches', { count: list.length })}</small></h2>
        <ol className="fx-matches">{list.map(match)}</ol>
      </section>
    ))
  }

  const table = (item: DrawTable) => {
    const title = item.group ? t('tableGroup', { group: item.group }) : t('tableLeague')
    const qualify = item.group ? places[item.group] ?? 0 : 0
    const progress = drawProgress(draw, draw.fixtures.filter(fixture => fixture.stage !== 'knockout' && (item.group ? fixture.group_label === item.group : fixture.stage === 'league')))
    return (
      <section key={item.key} aria-label={title} className="fx-table-card">
        <h2 className="fx-table-title"><b>{title}</b><small>{t('playedOf', progress)}</small></h2>
        <div className="fx-table-scroll">
          <table className="fx-table">
            <thead><tr>
              <th scope="col">{t('colTeam')}</th>
              <th scope="col">{t('colPlayed')}</th><th scope="col">{t('colWon')}</th><th scope="col">{t('colDrawn')}</th>
              <th scope="col">{t('colLost')}</th><th scope="col">{t('colGoalDifference')}</th><th scope="col">{t('colPoints')}</th>
            </tr></thead>
            <tbody>{item.rows.map((row, index) => (
              <tr key={row.teamId} className={index < qualify ? 'is-through' : undefined}>
                <th scope="row"><span className="fx-pos">{index + 1}</span>{name(row.teamId)}</th>
                <td>{row.played}</td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td>
                <td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td><td className="fx-points">{row.points}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {qualify > 0 && <p className="fx-legend"><i aria-hidden="true" />{t('qualifies', { count: qualify })}</p>}
      </section>
    )
  }

  const bracket = () => {
    const rounds = Array.from({ length: totalRounds }, (_, index) => index + 1)
    return (
      <div className="fx-bracket">
        {rounds.map(round => (
          <section key={round} className="fx-bracket-round" aria-label={roundLabel(round)}>
            <h2>{roundLabel(round)}</h2>
            {draw.fixtures.filter(fixture => fixture.stage === 'knockout' && fixture.round === round).sort((a, b) => matchNumber(a) - matchNumber(b)).map(fixture => {
              const view = viewFixture(draw, fixture)
              const row = (which: 'home' | 'away') => {
                const teamId = which === 'home' ? fixture.home_team_id : fixture.away_team_id
                const goals = view.score ? (which === 'home' ? view.score.home : view.score.away) : null
                return <div className={`fx-slot${view.winnerId && view.winnerId === teamId ? ' is-win' : ''}`}>
                  {teamId ? <span>{name(teamId)}</span> : <span className="fx-source">{source(which === 'home' ? fixture.home_source : fixture.away_source)}</span>}
                  {goals !== null && <b>{goals}</b>}
                </div>
              }
              return <div key={fixture.fixture_key} className="fx-bracket-match">{row('home')}{row('away')}{view.status === 'penalties' && view.winnerId && <small>{t('penaltiesWinner', { team: name(view.winnerId) })}</small>}</div>
            })}
            {round === totalRounds && <p className="fx-champion"><Trophy size={16} aria-hidden="true" />{(() => {
              const final = draw.fixtures.find(fixture => fixture.stage === 'knockout' && fixture.round === round)
              const winner = final ? viewFixture(draw, final).winnerId : null
              return winner ? t('championIs', { team: name(winner) }) : t('champion')
            })()}</p>}
          </section>
        ))}
      </div>
    )
  }

  if (!nav) return <div className="fx-board">{tables.map(table)}{sections(draw.fixtures)}</div>

  const views = boardViews(draw)
  const view = views.includes(nav.view) ? nav.view : 'fixtures'
  const groups = groupLabels(draw)
  const filters = [...(groups.length ? groups : []), ...(groups.length && hasKnockout(draw) ? ['knockout'] : [])]
  const filter = filters.includes(nav.filter) ? nav.filter : 'all'
  const filtered = filter === 'all' ? draw.fixtures : filter === 'knockout' ? draw.fixtures.filter(fixture => fixture.stage === 'knockout') : draw.fixtures.filter(fixture => fixture.group_label === filter)
  // A big draw pages by round: the round asked for, else the first one not finished.
  const roundKey = (fixture: StoredFixture) => `${fixture.stage === 'knockout' ? 'k' : 'm'}${fixture.round}`
  const roundKeys = [...new Set(filtered.map(roundKey))]
  const paged = filtered.length > ROUND_PAGE_LIMIT && roundKeys.length > 1
  const round = !paged ? null : roundKeys.includes(nav.round ?? '') ? nav.round!
    : roundKey(filtered.find(fixture => viewFixture(draw, fixture).status === 'pending') ?? filtered[filtered.length - 1])
  const shown = round ? filtered.filter(fixture => roundKey(fixture) === round) : filtered
  const roundName = (key: string) => key.startsWith('k') ? roundLabel(Number(key.slice(1))) : t('matchday', { round: key.slice(1) })

  return (
    <div className="fx-board">
      <nav className="fx-tabs" aria-label={t('viewsLabel')}>
        {views.map(item => <a key={item} href={nav.href(item)} className={`fx-tab${item === view ? ' is-on' : ''}`} aria-current={item === view ? 'page' : undefined}>{t(`tab.${item}`)}</a>)}
      </nav>
      {view === 'fixtures' && <div className={`fx-split${tables.length ? ' has-aside' : ''}`}>
        <div className="fx-main">
          {filters.length > 0 && <div className="fx-filters" role="group" aria-label={t('filterLabel')}>
            {['all', ...filters].map(item => <a key={item} href={nav.href('fixtures', item)} className={`fx-filter${item === filter ? ' is-on' : ''}`} aria-current={item === filter ? 'true' : undefined}>
              {item === 'all' ? t('filterAll') : item === 'knockout' ? t('stageKnockout') : t('stageGroup', { group: item })}
            </a>)}
          </div>}
          {round && <div className="fx-filters fx-rounds" role="group" aria-label={t('roundLabel')}>
            {roundKeys.map(key => <a key={key} href={nav.href('fixtures', filter, key)} className={`fx-filter${key === round ? ' is-on' : ''}`} aria-current={key === round ? 'true' : undefined}>{roundName(key)}</a>)}
          </div>}
          {round && (() => {
            const at = roundKeys.indexOf(round)
            const previous = roundKeys[at - 1], next = roundKeys[at + 1]
            return <div className="fx-pager">
              {previous ? <a href={nav.href('fixtures', filter, previous)} className="fx-pager-link">‹ {roundName(previous)}</a> : <span />}
              <b>{roundName(round)}</b>
              {next ? <a href={nav.href('fixtures', filter, next)} className="fx-pager-link">{roundName(next)} ›</a> : <span />}
            </div>
          })()}
          <p className="fx-provenance"><span className="ui-chip is-performance">{t('verifiedChip')}</span>{t('verifiedNote')}</p>
          {sections(shown)}
        </div>
        {tables.length > 0 && <aside className="fx-aside" aria-label={t('tab.tables')}>{tables.map(table)}</aside>}
      </div>}
      {view === 'tables' && tables.map(table)}
      {view === 'bracket' && bracket()}
    </div>
  )
}
