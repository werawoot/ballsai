import Link from 'next/link'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { Bell, CalendarDays, Check, ChevronRight, Clock3, Flame, MapPin, Play, Target, Trophy } from 'lucide-react'
import { radarPoints, type EffortSummary, type MissionItem, type NextSession, type VerifiedSkills, type WeekTotals } from '@/lib/athlete-home'
import { unreadBadge } from '@/lib/notification-unread'
import { drillImage, say } from '@/lib/training/content'
import { coverDetailFor, PROGRAM_PHOTOS } from '@/lib/stock-photos'
import { tournamentDateRange } from '@/lib/tournament-dates'

// The athlete's home (/profile) in the DOENSAI home module (owner, 3 Nov 2026, third
// reference), on the light glass of ADR-014. What each part shows is decided in
// lib/athlete-home.ts; these only draw it. One primary button: today's first open mission, or
// picking a programme. Effort points ("แต้มขยัน") are the athlete's own check-ins and never XP.

/** 1 and 2: greeting, the sport, the bell and the way to /me, then the level from verified matches. */
export function HomeHero({ name, line, avatarUrl, initials, unread, level, sport }: {
  name: string
  line: string
  avatarUrl: string | null
  initials: string
  unread: number | null
  level: { level: number; xp: number; target: number; percent: number } | null
  sport: string
}) {
  const t = useTranslations('profileHome')
  const badge = unreadBadge(unread)
  return <section className="pf-hero pf-home-hero" aria-labelledby="pf-name" style={avatarUrl ? { '--pf-hero-photo': `url("${avatarUrl}")` } as React.CSSProperties : undefined}>
    {avatarUrl && <span className="pf-hero-photo" aria-hidden="true" />}
    <div className="pf-home-top">
      <div style={{ minWidth: 0 }}>
        <small className="pf-hello">{t('home.hello')}</small>
        <h1 id="pf-name" className="pf-name">{name}</h1>
        {line && <div className="pf-sub">{line}</div>}
        <p className="pf-motivate">{t('home.motivate')}</p>
      </div>
      <div className="pf-home-icons">
        <Link href="/notifications" className="pf-icon-btn" aria-label={badge ? `${t('home.notifications')} · ${t('home.unread', { count: unread ?? 0 })}` : t('home.notifications')}>
          <Bell size={20} aria-hidden="true" />
          {badge && <span className="pf-icon-badge" aria-hidden="true">{badge.text}</span>}
        </Link>
        <Link href="/me" className="pf-home-avatar" style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined} aria-label={t('home.profile')}>
          {!avatarUrl && <span aria-hidden="true">{initials}</span>}
        </Link>
      </div>
    </div>
    <div className="pf-hero-row">
      {/* One sport today (lib/season.ts); choosing another waits for its own design (ADR-014). */}
      <details className="pf-sport">
        <summary>{t('home.sport', { sport })}</summary>
        <p>{t('home.sportMore')}</p>
      </details>
      <p className="pf-tagline" lang="en">{t('home.tagline')}</p>
    </div>
    {/* Level and points mean nothing before the first point, so they stay out of sight until then. */}
    {level && <div className="pf-lv">
      <div className="pf-lv-row"><b>{t('home.level', { level: level.level })}</b><span>{t('home.xp', { xp: level.xp.toLocaleString('en-US'), target: level.target.toLocaleString('en-US') })}</span></div>
      <div className="pf-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level.percent)} aria-label={t('level', { level: level.level })}><i style={{ width: `${level.percent}%` }} /></div>
    </div>}
  </section>
}

/**
 * 3: the athlete's card (one link to /card) and "ภาพรวมของฉัน" beside it. The card's number is
 * the rank row's OVR; no rank row is a STARTER card and says so (AGENTS.md rule 8). Minutes and
 * days in a row are self-reported; the rating change comes from verified matches.
 */
export function CardOverview({ name, team, position, avatarUrl, initials, ovr, power, change, ranked, minutes, streak }: {
  name: string
  team: string | null
  position: string | null
  avatarUrl: string | null
  initials: string
  ovr: number | null
  power: number | null
  change: number | null
  ranked: boolean
  minutes: number | null
  streak: number | null
}) {
  const t = useTranslations('profileHome')
  return <section className="pf-cardrow" aria-labelledby="pf-card">
    <h2 id="pf-card" className="pf-sr">{t('card.title')}</h2>
    <Link href="/card" className={`pf-bigcard${ranked ? '' : ' is-starter'}`}>
      <span className="pf-bigcard-top"><b>{ranked && ovr !== null ? ovr : '—'}</b><small>{position || '—'}</small></span>
      <span className="pf-bigcard-photo" style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined} aria-hidden="true">{!avatarUrl && initials}</span>
      <span className="pf-bigcard-name">{name}</span>
      {team && <span className="pf-bigcard-team">{team}</span>}
      {!ranked && <span className="pf-bigcard-starter">{t('card.starterTitle')}</span>}
    </Link>
    <div className="pf-overview">
      <b className="pf-overview-title">{t('overview.title')}</b>
      <div className="pf-overview-ovr">
        <small>{t('overview.power')}</small>
        <b>{ranked && power !== null ? power.toLocaleString('en-US') : '—'}</b>
        {ranked && change !== null && <em className={change > 0 ? 'is-up' : 'is-down'}>{change > 0 ? `↑ +${change}` : `↓ −${Math.abs(change)}`}</em>}
      </div>
      <div className="pf-overview-cells">
        <span><Clock3 size={16} aria-hidden="true" /><small>{t('overview.minutes')}</small><b>{minutes === null ? '—' : t('overview.minutesValue', { count: minutes })}</b></span>
        <span><Flame size={16} aria-hidden="true" /><small>{t('overview.streak')}</small><b>{streak === null ? '—' : t('overview.streakValue', { count: streak })}</b></span>
      </div>
      <p className="pf-overview-note">{ranked ? t('overview.note') : t('card.starterShort')}</p>
    </div>
  </section>
}

/** 4: today's missions, one per programme planned today, each worth effort points (never XP). */
export function MissionsCard({ missions, effort, firstOpen, hasNext }: { missions: MissionItem[]; effort: EffortSummary; firstOpen: string | null; hasNext: boolean }) {
  const t = useTranslations('profileHome')
  const locale = useLocale()
  return <section className="pf-card pf-missions" aria-labelledby="pf-missions">
    <div className="pf-card-head">
      <h2 id="pf-missions" className="pf-card-title"><Target size={20} aria-hidden="true" />{t('missions.title')}</h2>
      {effort.todayPossible > 0 && <span className="pf-effort-chip">{effort.todayEarned >= effort.todayPossible ? t('missions.earned', { points: effort.todayEarned }) : effort.todayEarned > 0 ? t('missions.partial', { earned: effort.todayEarned, points: effort.todayPossible }) : t('missions.possible', { points: effort.todayPossible })}</span>}
    </div>
    {missions.length === 0
      ? <p className="pf-missions-rest"><b>{t('missions.rest')}</b><small>{hasNext ? t('missions.restBody') : t('missions.restOnly')}</small></p>
      : <ul className="pf-mission-list">
        {missions.map(item => <li key={item.programId} className={item.done ? 'is-done' : undefined}>
          {item.done
            ? <span className="pf-mission-mark is-done" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
            : <Link href={`/training/${item.programId}/session`} className={`pf-mission-mark${item.programId === firstOpen ? ' is-primary' : ''}`} aria-label={t('missions.start', { title: say(item.program.title, locale) })}><Play size={15} aria-hidden="true" /></Link>}
          <Link href={`/training/${item.programId}`} className="pf-mission-text"><b>{say(item.program.title, locale)}</b><small>{t('missions.minutes', { count: item.minutes })}{item.done ? ` · ${t('missions.done')}` : ''}</small></Link>
          <span className="pf-mission-points">{t('missions.points', { points: item.points })}</span>
        </li>)}
      </ul>}
    <p className="pf-note">{t('missions.note')}</p>
  </section>
}

/** 5: the next session not done yet. */
export function NextTraining({ next, today }: { next: NextSession; today: string }) {
  const t = useTranslations('profileHome')
  const locale = useLocale()
  const isToday = next.date === today
  return <section className="pf-card pf-next" aria-labelledby="pf-next">
    <div className="pf-card-head">
      <h2 id="pf-next" className="pf-card-title"><CalendarDays size={20} aria-hidden="true" />{t('next.title')}</h2>
      <Link href="/training" className="pf-card-meta tap-44" style={{ textDecoration: 'none' }}>{t('next.all')}</Link>
    </div>
    <Link href={isToday ? `/training/${next.programId}/session` : `/training/${next.programId}`} className="pf-next-row">
      <span className="pf-next-img"><Image alt="" fill sizes="96px" src={PROGRAM_PHOTOS[next.programId]?.src ?? drillImage(next.program.cover)} unoptimized /></span>
      <span className="pf-next-text"><b>{say(next.program.title, locale)}</b><small>{isToday ? t('next.today', { count: next.program.minutes }) : t('next.on', { date: tournamentDateRange(locale, next.date), count: next.program.minutes })}</small></span>
      <span className="pf-next-play" aria-hidden="true"><Play size={18} /></span>
    </Link>
  </section>
}

export type HomeTournament = { id: string; name: string; location: string | null; start_date: string; end_date?: string | null; status: string | null }

/**
 * 6: one open tournament, soonest first. Entering is a team's step (a coach registers the team),
 * so the button opens the details; matching the athlete's age or area waits for T57.
 */
export function Opportunity({ tournament }: { tournament: HomeTournament }) {
  const t = useTranslations('profileHome')
  const locale = useLocale()
  const cover = coverDetailFor(tournament.id)
  return <section className="pf-card pf-opp" aria-labelledby="pf-opp">
    <div className="pf-card-head">
      <h2 id="pf-opp" className="pf-card-title"><Trophy size={20} aria-hidden="true" />{t('opportunity.title')}</h2>
      <Link href="/tournaments" className="pf-card-meta tap-44" style={{ textDecoration: 'none' }}>{t('opportunity.all')}</Link>
    </div>
    <div className="pf-opp-card" style={cover ? { '--pf-opp-photo': `url(${cover.src})` } as React.CSSProperties : undefined}>
      <div className="pf-opp-text">
        <b>{tournament.name}</b>
        {tournament.location && <small><MapPin size={13} aria-hidden="true" />{tournament.location}</small>}
        <small><CalendarDays size={13} aria-hidden="true" />{tournamentDateRange(locale, tournament.start_date, tournament.end_date)}</small>
      </div>
      <Link href={`/tournaments/${tournament.id}`} className="pf-opp-cta">{t('opportunity.view')}<ChevronRight size={16} aria-hidden="true" /></Link>
    </div>
    <p className="pf-note">{t('opportunity.note')}</p>
  </section>
}

/** 7: the week in numbers: sessions against the plan, minutes, effort points, and XP from verified matches. */
export function WeekProgress({ goal, effort, xp }: { goal: WeekTotals | null; effort: number | null; xp: number | null }) {
  const t = useTranslations('profileHome')
  const radius = 30
  const circumference = 2 * Math.PI * radius
  return <section className="pf-card pf-week" aria-labelledby="pf-week">
    <Link href="/training" className="pf-week-head">
      <h2 id="pf-week" className="pf-card-title">{t('week.title')}</h2>
      <ChevronRight size={20} aria-hidden="true" />
    </Link>
    <div className="pf-week-stats">
      <div className="pf-week-ring">
        <svg viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">
          <circle cx="36" cy="36" r={radius} className="pf-goal-track" />
          {goal && goal.done > 0 && <circle cx="36" cy="36" r={radius} className="pf-goal-fill" strokeDasharray={`${(goal.percent / 100) * circumference} ${circumference}`} transform="rotate(-90 36 36)" />}
        </svg>
        <span className="pf-week-ring-text"><b>{goal ? `${goal.done}/${goal.planned}` : '–'}</b><small>{t('week.sessionsUnit')}</small></span>
      </div>
      <dl>
        <div><dd>{goal ? goal.minutes : '—'}</dd><dt>{t('week.minutes')}</dt></div>
        <div><dd className="is-effort">{effort === null ? '—' : `+${effort}`}</dd><dt>{t('week.effort')}</dt></div>
        {/* A failed read is a dash, never a zero (AGENTS.md rule 8). */}
        <div><dd className="is-xp">{xp === null ? '—' : xp > 0 ? `+${xp.toLocaleString('en-US')}` : '0'}</dd><dt>{t('week.xp')}</dt></div>
      </dl>
    </div>
    <p className="pf-note">{t('week.note')}</p>
  </section>
}

export function SkillRadar({ skills }: { skills: VerifiedSkills | null }) {
  const t = useTranslations('profileHome')
  const names = useTranslations('player.skillNames')
  const locale = useLocale()
  if (!skills) return <section className="pf-card pf-skills is-empty" aria-labelledby="pf-skills">
    <h2 id="pf-skills" className="pf-card-title">{t('skills.title')}</h2>
    <p className="pf-note">{t('skills.empty')}</p>
  </section>
  const size = 180
  const radius = 62
  const values = skills.skills.map(([, value]) => value)
  const shape = radarPoints(values, radius).map(point => `${point.x},${point.y}`).join(' ')
  const rim = radarPoints(values.map(() => 99), radius)
  const labels = radarPoints(values.map(() => 99), radius + 18)
  const date = new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(skills.date))
  const list = skills.skills.map(([key, value]) => `${names(key)} ${value}`).join(', ')
  return <section className="pf-card pf-skills" aria-labelledby="pf-skills">
    <h2 id="pf-skills" className="pf-card-title">{t('skills.title')}</h2>
    <svg viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} width={size} height={size} role="img" aria-label={t('skills.chartLabel', { list })}>
      {[1, 0.66, 0.33].map(scale => <polygon key={scale} className="pf-radar-ring" points={rim.map(point => `${point.x * scale},${point.y * scale}`).join(' ')} />)}
      {rim.map((point, index) => <line key={index} className="pf-radar-axis" x1={0} y1={0} x2={point.x} y2={point.y} />)}
      <polygon className="pf-radar-shape" points={shape} />
      {skills.skills.map(([key, value], index) => <text key={key} x={labels[index].x} y={labels[index].y} className="pf-radar-label" textAnchor="middle" dominantBaseline="middle">
        <tspan x={labels[index].x} dy="-0.5em">{names(key)}</tspan>
        <tspan x={labels[index].x} dy="1.15em" className="pf-radar-value">{value}</tspan>
      </text>)}
    </svg>
    <p className="pf-note">{t(`skills.${skills.source}`, { date })}</p>
  </section>
}

