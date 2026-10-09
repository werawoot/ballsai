import Link from 'next/link'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Award, Check, CheckCircle2, ChevronRight, ExternalLink, Image as ImageIcon, PlayCircle, ShieldCheck, Trophy } from 'lucide-react'
import { isSampleId, samplePlayerRanks, showDemoData } from '@/lib/sample-data'
import { IDENTITY_BADGES, calculateLevel, identityTierKey, levelProgress } from '@/lib/digital-identity'
import { ACTIVE_SEASON, ACTIVE_SPORT } from '@/lib/season'
import { PUBLIC_PROFILE_COLUMNS, fetchAthleteAge } from '@/lib/athlete-private'
import { withAvatarUrls } from '@/lib/athlete-avatar'
import { SKILL_KEYS, skillText } from '@/lib/skill-ratings'
import { cardProvenance } from '@/lib/player-card'
import { seasonSummary } from '@/lib/player-profile'
import { FORM_EVENT_LIMIT, formHistory, playerTab, type RatingEventRow } from '@/lib/player-form'
import { fetchRankPosition } from '@/lib/public-ranking-page'
import PageHeader from '@/components/PageHeader'
import ReportHighlightButton from './ReportHighlightButton'
import DisputeDataButton from './DisputeDataButton'
import ShareProfileButton from './ShareProfileButton'
import './player.css'

// A public athlete profile (docs/design-system.md). Stadium header with the same card the
// athlete builds at /card, then Paper sections in the order a coach or scout reads them:
// this season's verified numbers, skills, identity, about, highlights, achievements, and
// where it all comes from. Skills, form and match-by-match sit behind three tabs (?tab=),
// the way a football card site reads; form is rating_events, which only verified results
// write. AGENTS.md rule 8 throughout: every number says its source, a
// skill nobody assessed is a dash, and a profile with no player_ranks row is a STARTER
// card that shows no Power, rank or skills at all.

type PlayerRecord = {
  id: string
  player_id?: string | null
  player_name: string
  team: string | null
  province: string | null
  position: string | null
  sport?: string | null
  season?: string | null
  ovr: number | null
  pts: number | null
  pac: number | null
  sho: number | null
  pas: number | null
  dri: number | null
  def: number | null
}

type AthleteProfile = {
  user_id: string
  display_name: string
  position?: string | null
  province?: string | null
  height_cm?: number | null
  weight_kg?: number | null
  current_team?: string | null
  bio?: string | null
  profile_image_url?: string | null
  verification_level: 'self' | 'coach_verified' | 'performance_verified'
}

type AthleteVideo = { id: number; title: string; video_url: string; video_type: string }
type AthleteHighlight = { id: number; title: string; media_type: 'image' | 'video' }
type AthleteAchievement = { id: number; title: string; event_name?: string | null; achievement_year?: number | null; verification_status: string }
type SkillAssessment = { speed?: number | null; stamina?: number | null; strength?: number | null; technique?: number | null; vision?: number | null; source_level: string }
type IdentityProgress = { xp_total: number; current_level: number }
type AthleteBadge = { badge_key: string; awarded_at: string }

const POSITIONS = ['FW', 'MF', 'DF', 'GK'] as const
const ASSESSED_KEYS = ['speed', 'stamina', 'strength', 'technique', 'vision'] as const
const VERIFICATION = ['self', 'coach_verified', 'performance_verified'] as const

export default async function PlayerPage(props: { params: Promise<{ id: string }>; searchParams?: Promise<{ tab?: string }> }) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams ?? Promise.resolve({} as { tab?: string })])
  const tab = playerTab(searchParams.tab)
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: cookiesToSet => cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )
  const [t, tCard, tHome, locale] = await Promise.all([getTranslations('player'), getTranslations('card'), getTranslations('profileHome'), getLocale()])

  const { data: player } = showDemoData && isSampleId(params.id)
    ? { data: samplePlayerRanks.find(item => item.id === params.id) ?? null }
    : await supabase.from('player_ranks').select('*').eq('id', params.id).maybeSingle()

  const routeIsUserId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.id)
  const linkedPlayerResult = !player && routeIsUserId
    ? await supabase.from('player_ranks').select('*').eq('player_id', params.id).eq('sport', ACTIVE_SPORT).eq('season', ACTIVE_SEASON).maybeSingle()
    : { data: null }
  const rank = (player || linkedPlayerResult.data) as PlayerRecord | null
  const athleteId = rank?.player_id || (routeIsUserId ? params.id : null)
  const rankSport = rank?.sport || ACTIVE_SPORT
  const rankSeason = rank?.season || ACTIVE_SEASON

  const [profileResult, videoResult, highlightResult, achievementResult, skillResult, progressResult, badgeResult, age, ratingResult, position] = await Promise.all([
    athleteId ? supabase.from('athlete_profiles').select(PUBLIC_PROFILE_COLUMNS).eq('user_id', athleteId).maybeSingle() : null,
    athleteId ? supabase.from('athlete_videos').select('*').eq('athlete_id', athleteId).order('created_at', { ascending: false }).limit(6) : null,
    athleteId ? supabase.from('athlete_highlights').select('id, title, media_type').eq('athlete_id', athleteId).order('created_at', { ascending: false }).limit(6) : null,
    athleteId ? supabase.from('athlete_achievements').select('*').eq('athlete_id', athleteId).order('created_at', { ascending: false }).limit(8) : null,
    athleteId ? supabase.from('athlete_skill_assessments').select('*').eq('athlete_id', athleteId).order('created_at', { ascending: false }).limit(1).maybeSingle() : null,
    athleteId ? supabase.from('athlete_progress').select('xp_total, current_level').eq('athlete_id', athleteId).maybeSingle() : null,
    athleteId ? supabase.from('athlete_badges').select('badge_key, awarded_at').eq('athlete_id', athleteId).order('awarded_at', { ascending: false }) : null,
    // An age, never the birth date: public_athlete_age (sql/58) works it out in the database.
    athleteId ? fetchAthleteAge(supabase, athleteId) : null,
    // This season's verified results behind the rank row (public read, written only by
    // verified match results).
    rank && !isSampleId(rank.id) ? supabase.from('player_ratings').select('id, power_rating, matches_played, wins, draws, losses, goals, assists, clean_sheets, mvps').eq('player_rank_id', rank.id).eq('sport', rankSport).eq('season', rankSeason).maybeSingle() : null,
    rank && typeof rank.pts === 'number' && !isSampleId(rank.id) ? fetchRankPosition(supabase, { sport: rankSport, season: rankSeason, id: rank.id, pts: rank.pts }).catch(() => null) : null,
  ])
  // The photo is a private object (T51): signed only if this viewer may see it.
  const athleteProfile = profileResult?.data ? (await withAvatarUrls(supabase, [profileResult.data as AthleteProfile]))[0] : null
  const videos = (videoResult?.data ?? []) as AthleteVideo[]
  const uploadedHighlights = (highlightResult?.data ?? []) as AthleteHighlight[]
  const achievements = (achievementResult?.data ?? []) as AthleteAchievement[]
  const skillAssessment = skillResult?.data as SkillAssessment | null
  const identityProgress = progressResult?.data as IdentityProgress | null
  const athleteBadges = (badgeResult?.data ?? []) as AthleteBadge[]

  if (!rank && !athleteProfile) redirect('/athletes')
  const hasRanking = Boolean(rank)
  const season = seasonSummary(ratingResult?.data ?? null)
  // Match by match, newest first: one indexed read (player_rating_id, created_at desc).
  const ratingId = season ? (ratingResult?.data as { id?: string } | null)?.id : null
  const eventsResult = ratingId
    ? await supabase.from('rating_events').select('created_at, result, rating_after, rating_change, goals, assists, mvp, clean_sheet').eq('player_rating_id', ratingId).order('created_at', { ascending: false }).limit(FORM_EVENT_LIMIT)
    : null
  const form = formHistory((eventsResult?.data ?? []) as RatingEventRow[])

  const displayName = athleteProfile?.display_name || rank?.player_name || t('fallbackName')
  const team = athleteProfile?.current_team || rank?.team || null
  const province = athleteProfile?.province || rank?.province || null
  const positionCode = athleteProfile?.position || rank?.position || null
  const positionName = positionCode && (POSITIONS as readonly string[]).includes(positionCode) ? t(`positions.${positionCode as (typeof POSITIONS)[number]}`) : positionCode
  const verification = (VERIFICATION as readonly string[]).includes(athleteProfile?.verification_level ?? '') ? athleteProfile!.verification_level : 'self'
  // As on /card: the card's source chip reads the same rule for every athlete.
  const provenance = cardProvenance({ matches: season?.matches ?? null, verificationLevel: verification })
  const cardChip = provenance === 'performance'
    ? (season ? tCard('provenance.performance', { count: season.matches }) : tCard('provenance.performanceNoCount'))
    : tCard(`provenance.${provenance}`)
  // The source level the page states, from the strongest evidence there is: verified
  // results outrank a coach's vouching, which outranks a self-entered profile.
  const evidence = provenance === 'performance' ? 'performance_verified' : provenance === 'coach' ? 'coach_verified' : 'self'
  const power = hasRanking ? (season?.power ?? rank?.pts ?? null) : null
  const photo = athleteProfile?.profile_image_url ?? null
  const initials = displayName.trim().split(/\s+/).map(part => [...part][0] ?? '').join('').slice(0, 2).toUpperCase()

  const cardSkills = SKILL_KEYS.map(key => ({ key, label: t(`skillNames.${key}`), short: key.toUpperCase(), value: rank?.[key] ?? null }))
  const assessed = skillAssessment ? ASSESSED_KEYS.map(key => ({ key, label: t(`skillNames.${key}`), value: skillAssessment[key] ?? null })).filter(item => item.value !== null) : []
  const skillRows = assessed.length ? assessed : hasRanking ? cardSkills : []
  const anyCardSkill = cardSkills.some(item => item.value !== null)
  const skillChip = assessed.length
    ? { tone: skillAssessment!.source_level === 'self' ? 'is-self' : 'is-coach', text: (VERIFICATION as readonly string[]).includes(skillAssessment!.source_level) ? t(`skillSource.${skillAssessment!.source_level as (typeof VERIFICATION)[number]}`) : t('skillSource.assessed') }
    : anyCardSkill ? { tone: 'is-coach', text: t('skillSource.assessed') } : { tone: 'is-self', text: t('skillSource.notAssessed') }

  const level = identityProgress?.current_level ?? calculateLevel(0)
  const xp = identityProgress?.xp_total ?? 0
  const earned = new Set(athleteBadges.map(item => item.badge_key))
  const facts = [
    { label: t('facts.position'), value: positionName ?? t('notSet') },
    { label: t('facts.age'), value: age !== null && age !== undefined ? t('age', { age }) : t('notSet') },
    { label: t('facts.height'), value: athleteProfile?.height_cm ? t('cm', { value: athleteProfile.height_cm }) : t('notSet') },
    { label: t('facts.weight'), value: athleteProfile?.weight_kg ? t('kg', { value: athleteProfile.weight_kg }) : t('notSet') },
    { label: t('facts.province'), value: province ?? t('notSet') },
    { label: t('facts.team'), value: team ?? t('notSet') },
  ]
  const skillsCard = <>
    <div className="pp-section-head"><h2>{t('skills')}</h2><span className={`ui-chip ${skillChip.tone}`}>{skillChip.text}</span></div>
    <div className="ui-card pp-bars">
      {skillRows.map(item => <div className={`pp-bar${item.value === null ? ' is-na' : ''}`} key={item.key}>
        <span>{item.label}</span>
        <span className="pp-track" aria-hidden="true">{item.value !== null && <i style={{ width: `${Math.max(0, Math.min(100, item.value))}%` }} />}</span>
        <b>{skillText(item.value)}</b>
      </div>)}
      {skillRows.some(item => item.value === null) && <p className="pp-note">{t('skillDash')}</p>}
    </div>
  </>
  const tabHref = (item: string) => `${item === 'skills' ? '?' : `?tab=${item}`}#pp-tabs`
  const dateText = (value: string) => new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
  const changeTone = (value: number) => ['is-down', undefined, 'is-up'][Math.sign(value) + 1]
  const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0')
  const subline = [positionName, team, province, age !== null && age !== undefined ? t('age', { age }) : null].filter(Boolean).join(' · ')
  const meta = [team, province].filter(Boolean).join(' · ')

  return (
    <main className="bds-page pp ui-matchday">
      <PageHeader back={{ href: '/athletes', label: t('back') }} />

      <section className="pp-hero ui-dark">
        <div className="pp-hero-inner">
          <div className={`pp-card is-${provenance}`} aria-hidden="true">
            <div className="pp-card-photo" style={photo ? { backgroundImage: `url("${photo}")` } : undefined}>{!photo && <span>{initials}</span>}</div>
            <div className="pp-card-scrim" />
            <div className={`pp-card-ovr${hasRanking && rank?.ovr != null ? '' : ' is-empty'}`}>
              <b>{hasRanking ? skillText(rank?.ovr) : 'STARTER'}</b>
              <span>{positionCode}{power !== null ? ` · POWER ${power.toLocaleString('en-US')}` : ''}</span>
            </div>
            <i className="pp-card-brand">B</i>
            <div className="pp-card-info">
              <span className={`pp-card-chip is-${provenance}`}>{provenance !== 'self' && <Check size={11} strokeWidth={3} />}{cardChip}</span>
              <b className="pp-card-name">{displayName}</b>
              {meta && <small className="pp-card-meta">{meta}</small>}
              {hasRanking
                ? <div className="pp-card-stats">{cardSkills.map(item => <div key={item.key}><b>{skillText(item.value)}</b><span>{item.short}</span></div>)}</div>
                : <p className="pp-card-unlock">{tCard('unlockBefore')}<b>{tCard('unlockRating')}</b>{tCard('unlockAfter')}</p>}
              <div className="pp-card-foot"><span>BALLDOENSAI.COM</span><span>SEASON {rankSeason}</span></div>
            </div>
          </div>
          <div className="pp-hero-text">
            <h1>{displayName}</h1>
            {subline && <p className="pp-sub">{subline}</p>}
            <div className="pp-chips">
              {!hasRanking && <span className="ui-chip is-self">{t('starterChip')}</span>}
              {/* The same source as the chip on the card: verified results outrank a self-entered profile. */}
              <span className={`ui-chip ${provenance === 'performance' ? 'is-performance' : provenance === 'coach' ? 'is-coach' : 'is-self'}`}>{provenance !== 'self' && <CheckCircle2 size={13} aria-hidden="true" />}{t(`verification.${evidence}`)}</span>
              {athleteId && <span className="ui-chip is-self">{t('level', { level: String(level).padStart(2, '0') })}</span>}
            </div>
            {athleteProfile && <dl className="pp-quick">{facts.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>}
            <div className="pp-actions">
              <ShareProfileButton name={displayName} />
              {position && <Link className="ui-btn ui-btn-ghost-d pp-rank-link" href={`/ranking?page=${position.page}#rank-${position.rankId}`}>{t('inRanking')}</Link>}
            </div>
          </div>
        </div>
      </section>

      <div className="pp-body">
        <section className="pp-section">
          <div className="pp-section-head"><h2>{t('season', { season: rankSeason })}</h2>{season && <span className="ui-chip is-performance">{t('seasonSource')}</span>}</div>
          {hasRanking
            ? <div className="ui-card pp-season">
                <div className="pp-power">
                  <div><small>{t('power')}</small><b>{power !== null ? power.toLocaleString('en-US') : '—'}</b></div>
                  {position && <div className="pp-rank"><small>{t('rank')}</small><b>#{position.position.toLocaleString('en-US')}</b></div>}
                </div>
                {season
                  ? <>
                      <div className="pp-tiles">
                        {([['matches', season.matches], ['goals', season.goals], ['assists', season.assists], ['mvps', season.mvps]] as const).map(([key, value]) => <div key={key}><b>{value}</b><small>{t(key)}</small></div>)}
                      </div>
                      <p className="pp-wdl"><span>{t('teamResults')}</span><i className="is-w">{t('wins', { count: season.wins })}</i><i className="is-d">{t('draws', { count: season.draws })}</i><i className="is-l">{t('losses', { count: season.losses })}</i><span>· {t('cleanSheets', { count: season.cleanSheets })}</span></p>
                    </>
                  : <p className="pp-note">{t('noSeasonRankedText')}</p>}
              </div>
            : <div className="ui-card pp-starter">
                <Trophy size={28} strokeWidth={1.6} aria-hidden="true" />
                <b>{t('noSeasonTitle')}</b>
                <p>{t('noSeasonText')}</p>
                <Link className="ui-btn ui-btn-ghost ui-btn-sm" href="/tournaments?view=open">{t('noSeasonCta')}</Link>
              </div>}
        </section>

        {hasRanking && <section className="pp-section pp-tabbed" id="pp-tabs">
          <nav className="pp-tabs" aria-label={t('tabsLabel')}>
            {(['skills', 'form', 'matches'] as const).map(item => <a key={item} href={tabHref(item)} className={item === tab ? 'is-on' : undefined} aria-current={item === tab ? 'page' : undefined}>{t(`tabs.${item}`)}</a>)}
          </nav>
          {tab === 'skills' && skillsCard}
          {tab === 'form' && <>
            <div className="pp-section-head"><h2>{t('formTitle')}</h2>{form.matches.length > 0 && <span className="ui-chip is-performance">{t('seasonSource')}</span>}</div>
            {form.matches.length
              ? <div className="ui-card pp-form">
                  <ol className="pp-last5" aria-label={t('lastFive')}>
                    {form.lastFive.map((result, index) => <li key={index} className={`is-${result}`} title={t(`result.${result}`)}><span aria-hidden="true">{t(`resultShort.${result}`)}</span><span className="pp-sr">{t(`result.${result}`)}</span></li>)}
                  </ol>
                  {form.chart
                    ? <figure className="pp-chart">
                        <figcaption><small>{t('chartTitle')}</small><b>{form.chart.first.toLocaleString('en-US')} → {form.chart.last.toLocaleString('en-US')}</b></figcaption>
                        <svg viewBox="0 0 320 120" role="img" aria-label={t('chartLabel', { first: form.chart.first, last: form.chart.last, count: form.chart.points.length })}>
                          <path className="pp-chart-area" d={`${form.chart.line} L${form.chart.points[form.chart.points.length - 1][0]} 120 L${form.chart.points[0][0]} 120 Z`} />
                          <path className="pp-chart-line" d={form.chart.line} />
                          {form.chart.points.map(([x, y], index) => <circle key={index} cx={x} cy={y} r={index === form.chart!.points.length - 1 ? 4.5 : 3} />)}
                        </svg>
                        <p className="pp-note">{t('chartNote', { count: form.chart.points.length })}</p>
                      </figure>
                    : <p className="pp-note">{t('chartNeedsTwo')}</p>}
                </div>
              : <div className="ui-card pp-starter"><b>{t('noSeasonTitle')}</b><p>{t('noFormText')}</p></div>}
          </>}
          {tab === 'matches' && <>
            <div className="pp-section-head"><h2>{t('matchesTitle')}</h2>{form.matches.length > 0 && <span className="ui-chip is-performance">{t('seasonSource')}</span>}</div>
            {form.matches.length
              ? <ol className="ui-card pp-matchlist">
                  {form.matches.map((item, index) => <li key={`${item.date}-${index}`}>
                    <span className={`pp-res is-${item.result}`} title={t(`result.${item.result}`)}><span aria-hidden="true">{t(`resultShort.${item.result}`)}</span><span className="pp-sr">{t(`result.${item.result}`)}</span></span>
                    <div className="pp-match-main">
                      <b>{dateText(item.date)}</b>
                      <small>{[t('matchGoals', { count: item.goals }), t('matchAssists', { count: item.assists }), item.cleanSheet ? t('cleanSheetTag') : null].filter(Boolean).join(' · ')}</small>
                      {item.mvp && <span className="pp-mvp">{t('mvpTag')}</span>}
                    </div>
                    <div className="pp-match-rating"><b>{item.ratingAfter.toLocaleString('en-US')}</b><small className={changeTone(item.change)}>{signed(item.change)}</small></div>
                  </li>)}
                </ol>
              : <div className="ui-card pp-starter"><b>{t('noSeasonTitle')}</b><p>{t('noFormText')}</p></div>}
            {form.matches.length >= FORM_EVENT_LIMIT && <p className="pp-note">{t('matchesWindow', { count: FORM_EVENT_LIMIT })}</p>}
          </>}
        </section>}

        {!hasRanking && skillRows.length > 0 && <section className="pp-section">
          {skillsCard}
        </section>}

        {athleteId && <section className="pp-section">
          <div className="ui-card pp-identity">
            <div className="pp-level">
              <span className="pp-level-n">{String(level).padStart(2, '0')}</span>
              <div><small>{tHome(`tiers.${identityTierKey(level)}`)}</small><b>{t('identity')}</b><span>{t('xpBadges', { xp: xp.toLocaleString('en-US'), badges: earned.size })}</span></div>
            </div>
            <div className="pp-xp" aria-hidden="true"><i style={{ width: `${levelProgress(xp, level).percentage}%` }} /></div>
            <ul className="pp-badges">
              {IDENTITY_BADGES.map(badge => <li className={earned.has(badge.key) ? 'is-on' : ''} key={badge.key}>{locale === 'th' ? badge.thaiName : badge.name}</li>)}
            </ul>
          </div>
        </section>}

        {athleteProfile?.bio && <section className="pp-section">
          <div className="pp-section-head"><h2>{t('about')}</h2></div>
          <div className="ui-card pp-about"><p className="pp-bio">{athleteProfile.bio}</p></div>
        </section>}

        {(uploadedHighlights.length > 0 || videos.length > 0) && <section className="pp-section">
          <div className="pp-section-head"><h2>{t('highlights')}</h2></div>
          <div className="pp-highlights">
            {uploadedHighlights.map(item => <div className="pp-hl" key={`upload-${item.id}`}>
              <a href={`/api/highlights/${item.id}/media`} rel="noreferrer" target="_blank">
                <span className="pp-hl-icon">{item.media_type === 'video' ? <PlayCircle size={26} aria-hidden="true" /> : <ImageIcon size={24} aria-hidden="true" />}</span>
                <b>{item.title}</b><small>{item.media_type === 'video' ? t('uploadedVideo') : t('uploadedImage')}</small>
              </a>
              <span className="pp-hl-report"><ReportHighlightButton highlightId={item.id} /></span>
            </div>)}
            {videos.map(video => <div className="pp-hl" key={`link-${video.id}`}>
              <a href={video.video_url} rel="noreferrer" target="_blank">
                <span className="pp-hl-icon"><PlayCircle size={26} aria-hidden="true" /></span>
                <b>{video.title}</b><small>{t('externalVideo')} <ExternalLink size={11} aria-hidden="true" /></small>
              </a>
            </div>)}
          </div>
        </section>}

        {achievements.length > 0 && <section className="pp-section">
          <div className="pp-section-head"><h2>{t('achievements')}</h2></div>
          <ul className="ui-card pp-achievements">
            {achievements.map(item => <li key={item.id}>
              <Award size={19} aria-hidden="true" className={item.verification_status === 'verified' ? 'is-verified' : ''} />
              <div><b>{item.title}</b>{(item.event_name || item.achievement_year) && <small>{[item.event_name, item.achievement_year].filter(Boolean).join(' · ')}</small>}</div>
              {item.verification_status === 'verified' && <span className="ui-chip is-performance">{t('verifiedAchievement')}</span>}
            </li>)}
          </ul>
        </section>}

        <section className="pp-section">
          <details className="ui-card pp-trust">
            <summary><ShieldCheck size={20} aria-hidden="true" /><span><b>{t('trustTitle')}</b><small>{hasRanking ? t(`trust.${evidence}`) : t('trust.starter')}</small></span><ChevronRight size={18} aria-hidden="true" className="pp-trust-chevron" /></summary>
            <ul>
              <li>{hasRanking ? t(`trust.${evidence}`) : t('trust.starter')}</li>
              {hasRanking && <li>{anyCardSkill || assessed.length ? t('trustSkills.assessed') : t('trustSkills.notAssessed')}</li>}
              <li>{t('trustNote')}</li>
            </ul>
            {athleteId && <DisputeDataButton subjectType={hasRanking ? 'player_rank' : 'athlete_profile'} subjectId={hasRanking ? rank!.id : athleteId} />}
          </details>
        </section>
      </div>
    </main>
  )
}
