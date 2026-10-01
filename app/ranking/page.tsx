import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { ChevronRight, Star, Trophy } from 'lucide-react'
import RankingFilter from './RankingFilter'
import DiscoverTabs from '@/components/DiscoverTabs'
import { samplePlayerRanks, showDemoData } from '@/lib/sample-data'
import { getPublicIdentityRankingData, getPublicRankingPage, getPublicRankingProvinces } from '@/lib/public-data'
import { fetchMyRankingPosition } from '@/lib/public-ranking-page'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { parsePage } from '@/lib/pagination'
import { provinceName } from '@/lib/thai-provinces'
import Pagination from '@/components/Pagination'
import { ACTIVE_SEASON, ACTIVE_SPORT } from '@/lib/season'
import PageHeader from '@/components/PageHeader'
import { podiumNameLines } from '@/lib/podium-name'
import './ranking.css'

// /ranking on the Paper surface (docs/design-system.md): a plain header, one row of views,
// one row of filters, the signed-in athlete's own place, a podium that shows only what is
// known (name, place, Power -- no card full of unassessed dashes) and rows that read at a
// glance. The data and paging are unchanged (T46): 50 per page over every ranked athlete.

const VIEWS = ['overall', 'trending', 'emerging', 'mvp'] as const
type View = (typeof VIEWS)[number]
type Row = { id: string; player_name: string; team?: string | null; province?: string | null; position?: string | null; pts: number; rank_change?: number | null; mvps?: number | null; goals?: number | null }

// A steady colour per athlete for the initials, from the row id.
const AVATAR_TONES = ['#2a3446', '#3b4a63', '#5a2a2a', '#1f3b3a', '#4a3a24']
const tone = (id: string) => AVATAR_TONES[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_TONES.length]
const initials = (name: string) => name.trim().split(/\s+/).map(part => [...part][0] ?? '').join('').slice(0, 2).toUpperCase()

export default async function RankingPage(
  props: {
   searchParams: Promise<{ province?: string; position?: string; sport?: string; search?: string; view?: string; page?: string }>
  }
) {
  const searchParams = await props.searchParams
  const sport = searchParams.sport ?? ACTIVE_SPORT
  const province = searchParams.province ?? ''
  const position = searchParams.position ?? ''
  const search = searchParams.search ?? ''
  const view: View = (VIEWS as readonly string[]).includes(searchParams.view ?? '') ? searchParams.view as View : 'overall'
  // T46: the overall table pages through every ranked athlete, 50 at a time. The other
  // tabs are top-50 lists by nature and say so.
  const page = view === 'overall' ? parsePage(searchParams.page) : 1

  const [rankingPage, provinces, identityData, myPosition, t, tSport, locale] = await Promise.all([
    getPublicRankingPage({ sport, season: ACTIVE_SEASON, province, position, search, page }),
    getPublicRankingProvinces(sport, ACTIVE_SEASON),
    getPublicIdentityRankingData(),
    findMyPosition(sport),
    getTranslations('ranking'),
    getTranslations('tournamentCover.sport'),
    getLocale(),
  ])
  const rankings = rankingPage.rows as unknown as Row[]

  const fallbackRankings: Row[] = showDemoData ? samplePlayerRanks
    .filter(player => player.sport === sport)
    .filter(player => !province || player.province === province)
    .filter(player => !position || player.position === position)
    .filter(player => !search || player.player_name.includes(search)) : []
  const displayRankings = rankings.length > 0 ? rankings : fallbackRankings
  const uniqueProvinces = [...new Set(provinces.length > 0 ? provinces : showDemoData ? samplePlayerRanks.map(p => p.province) : [])]

  const trending = [...displayRankings].filter(player => (player.rank_change ?? 0) > 0).sort((a, b) => (b.rank_change ?? 0) - (a.rank_change ?? 0) || b.pts - a.pts)
  const emerging = (identityData.emerging.length ? identityData.emerging : trending) as unknown as Row[]
  const mvpLeaders = [...identityData.performance].sort((a, b) => b.mvps - a.mvps || b.goals - a.goals || b.pts - a.pts) as unknown as Row[]
  const rows = view === 'trending' ? (trending.length ? trending : displayRankings) : view === 'emerging' ? (emerging.length ? emerging : displayRankings) : view === 'mvp' ? (mvpLeaders.length ? mvpLeaders : displayRankings) : displayRankings
  const showPodium = (view !== 'overall' || page === 1) && rows.length >= 3
  const top3 = showPodium ? rows.slice(0, 3) : []
  const rest = showPodium ? rows.slice(3) : rows
  // The number shown next to each row in the list.
  const firstRank = view === 'overall' ? rankingPage.firstRank : 1
  const listStart = firstRank + (showPodium ? 3 : 0)
  const lastShown = firstRank + rows.length - 1
  const filtered = Boolean(province || position || search)
  const sportName = sport === 'football' || sport === 'futsal' ? tSport(sport) : sport
  const viewHref = (item: View) => {
    const query = new URLSearchParams({ ...(province ? { province } : {}), ...(position ? { position } : {}), ...(search ? { search } : {}), ...(item !== 'overall' ? { view: item } : {}) }).toString()
    return `/ranking${query ? `?${query}` : ''}`
  }
  const change = (value: number | null | undefined) => {
    const n = value ?? 0
    return n > 0 ? { cls: 'is-up', text: `▲ ${n}`, label: t('change.up', { count: n }) } : n < 0 ? { cls: 'is-down', text: `▼ ${-n}`, label: t('change.down', { count: -n }) } : { cls: 'is-same', text: '–', label: t('change.same') }
  }
  const sub = (p: Row) => [p.position, p.team, p.province ? provinceName(p.province, locale) : null].filter(Boolean).join(' · ')

  return (
    <main className="bds-page rk">
      <PageHeader />
      <DiscoverTabs current="/ranking" />

      <div className="rk-wrap">
        <div className="rk-top">
          <div>
            <p className="ui-eyebrow">{t('eyebrow', { season: ACTIVE_SEASON, sport: sportName })}</p>
            <h1 className="ui-h1 rk-title">{t('title')}</h1>
            <p className="rk-intro">{t('intro')}</p>
          </div>
          <nav className="rk-views" aria-label={t('viewsLabel')}>
            {VIEWS.map(item => <Link aria-current={item === view ? 'page' : undefined} className={item === view ? 'is-on' : ''} href={viewHref(item)} key={item}>{t(`views.${item}`)}</Link>)}
          </nav>
        </div>

        <div className="rk-layout">
          <aside className="rk-side">
            <RankingFilter provinces={uniqueProvinces} currentProvince={province} currentPosition={position} currentSearch={search} />

            {/* MY POSITION (T46): a signed-in athlete can always find their place. A plain
                link: a full load lets the browser scroll to the row by its #id. */}
            {view === 'overall' && myPosition && (
              <a className="rk-me" href={`/ranking?page=${myPosition.page}#rank-${myPosition.rankId}`}>
                <Star size={16} aria-hidden="true" />
                <span>{t('myRank')}</span>
                <b>#{myPosition.position.toLocaleString('en-US')}</b>
                <em>{myPosition.page === page && !filtered ? t('onThisPage') : t('goToPage', { page: myPosition.page })}</em>
              </a>
            )}

            {top3.length === 3 && (
              <section className="rk-podium" aria-label={t('podiumLabel')}>
                {[top3[1], top3[0], top3[2]].map((p, index) => {
                  const place = index === 0 ? 2 : index === 1 ? 1 : 3
                  return <Link className={`rk-pod${place === 1 ? ' is-first' : ''}`} href={`/players/${p.id}`} id={`rank-${p.id}`} key={p.id}>
                    <span className={`rk-medal is-${place}`}>{place}</span>
                    <span className="rk-av" style={{ background: tone(p.id) }} aria-hidden="true">{initials(p.player_name)}</span>
                    <b className="rk-pod-name">{podiumNameLines(p.player_name).map((line, i) => <span key={i}>{line}</span>)}</b>
                    <small>{[p.position, p.province ? provinceName(p.province, locale) : null].filter(Boolean).join(' · ')}</small>
                    <span className="rk-pod-power">{view === 'mvp' ? t('mvpLine', { mvps: p.mvps ?? 0, goals: p.goals ?? 0 }) : p.pts.toLocaleString('en-US')}</span>
                  </Link>
                })}
              </section>
            )}
          </aside>

          <section className="rk-main">
            <p className="rk-hint">{view === 'overall' ? t('viewHint.overall', { from: firstRank.toLocaleString('en-US'), to: lastShown.toLocaleString('en-US') }) : t(`viewHint.${view}`)}</p>
            {rest.length > 0 && <>
              {showPodium && <h2 className="rk-rest-title">{t('restTitle', { from: listStart.toLocaleString('en-US'), to: lastShown.toLocaleString('en-US') })}</h2>}
              <div className="rk-head" aria-hidden="true"><span>{t('table.rank')}</span><span>{t('table.athlete')}</span><span>{t('table.position')}</span><span>{t('table.province')}</span><span>{t('table.power')}</span><span>{t('table.change')}</span></div>
              <ol className="rk-rows" start={listStart}>
                {rest.map((p, i) => {
                  const c = change(p.rank_change)
                  return <li key={p.id}>
                    <Link className={`rk-row${myPosition?.rankId === p.id ? ' is-mine' : ''}`} href={`/players/${p.id}`} id={`rank-${p.id}`}>
                      <span className="rk-n">{(listStart + i).toLocaleString('en-US')}</span>
                      <span className="rk-who">
                        <span className="rk-av" style={{ background: tone(p.id) }} aria-hidden="true">{initials(p.player_name)}</span>
                        <span className="rk-name"><b>{p.player_name}</b><small>{view === 'mvp' ? t('mvpLine', { mvps: p.mvps ?? 0, goals: p.goals ?? 0 }) : sub(p)}</small></span>
                      </span>
                      <span className="rk-col">{p.position}</span>
                      <span className="rk-col">{p.province ? provinceName(p.province, locale) : ''}</span>
                      <span className="rk-power"><b>{p.pts.toLocaleString('en-US')}</b><small className={c.cls} aria-label={c.label}>{c.text}</small></span>
                      <span className={`rk-col rk-change ${c.cls}`} aria-hidden="true">{c.text}</span>
                    </Link>
                  </li>
                })}
              </ol>
            </>}

            {rows.length === 0 && (
              <div className="ui-card rk-empty" role="status">
                <Trophy size={40} strokeWidth={1.4} aria-hidden="true" />
                <p className="ui-h2">{filtered ? t('empty') : t('emptyNoData')}</p>
                <p>{t('emptyHint')}</p>
                {filtered && <Link className="ui-btn ui-btn-ghost ui-btn-sm" href={view === 'overall' ? '/ranking' : `/ranking?view=${view}`}>{t('clearFilters')} <ChevronRight size={16} aria-hidden="true" /></Link>}
              </div>
            )}

            {view === 'overall' && <Pagination basePath="/ranking" page={page} hasNext={rankingPage.hasNext} params={{ province, position, search }} />}
          </section>
        </div>
      </div>
    </main>
  )
}

// A signed-in athlete's place in the overall table, or null (signed out, no rank row, or
// the lookup failed: the table must render regardless).
async function findMyPosition(sport: string) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    return await fetchMyRankingPosition(supabase, { sport, season: ACTIVE_SEASON, userId: user.id })
  } catch {
    return null
  }
}
