import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Bell, CalendarDays, MapPin } from 'lucide-react'
import { radarPoints, type VerifiedSkills, type WeeklyGoal } from '@/lib/athlete-home'
import type { Progress } from '@/lib/training/schedule'
import { unreadBadge } from '@/lib/notification-unread'
import { tournamentDateRange, tournamentFee } from '@/lib/tournament-dates'

// The parts of the athlete's home (/profile) in the DOENSAI dashboard design (owner, 2 Nov
// 2026), on the light glass of ADR-014. What each shows is decided in lib/athlete-home.ts;
// these only draw it. Only the training card holds the page's one primary button.

/** Greeting, the bell and the way to /me, then the level from verified matches. */
export function HomeHero({ name, line, avatarUrl, initials, unread, level }: {
  name: string
  line: string
  avatarUrl: string | null
  initials: string
  unread: number | null
  level: { level: number; xp: number; next: number; percent: number } | null
}) {
  const t = useTranslations('profileHome')
  const badge = unreadBadge(unread)
  return <section className="pf-hero pf-home-hero" aria-labelledby="pf-name">
    <div className="pf-home-top">
      <div style={{ minWidth: 0 }}>
        <small className="pf-hello">{t('home.hello')}</small>
        <h1 id="pf-name" className="pf-name">{name}</h1>
        {line && <div className="pf-sub">{line}</div>}
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
    {/* Level and points mean nothing before the first point, so they stay out of sight until then. */}
    {level && <div className="pf-level">
      <div className="pf-level-num"><small>{t('levelLabel')}</small><b>{String(level.level).padStart(2, '0')}</b></div>
      <div className="pf-level-body">
        <div className="pf-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level.percent)} aria-label={t('level', { level: level.level })}><i style={{ width: `${level.percent}%` }} /></div>
        <small>{t('xpToNext', { xp: level.xp.toLocaleString(), remaining: level.next.toLocaleString(), next: level.level + 1 })}</small>
      </div>
    </div>}
  </section>
}

/** The week of the athlete's programme: planned and done days, sessions, minutes and the streak. */
export function WeekProgress({ progress, goal, programId }: { progress: Progress; goal: WeeklyGoal | null; programId: string }) {
  const t = useTranslations('profileHome')
  const days = useTranslations('training.schedule.days')
  const radius = 26
  const circumference = 2 * Math.PI * radius
  return <section className="pf-card pf-week" aria-labelledby="pf-week">
    <div className="pf-card-head">
      <h2 id="pf-week" className="pf-card-title">{t('week.title')}</h2>
      <Link href={`/training/${programId}`} className="pf-card-meta tap-44" style={{ textDecoration: 'none' }}>{t('week.open')}</Link>
    </div>
    <ol className="pf-week-days">
      {progress.thisWeek.map(day => <li key={day.date} className={[day.planned && 'is-plan', day.done && 'is-done', day.isToday && 'is-today'].filter(Boolean).join(' ')}>
        <span>{days(`d${day.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6}`)}</span>
        <span className="pf-sr">{day.done ? t('week.dayDone') : day.planned ? t('week.dayPlanned') : t('week.dayRest')}</span>
      </li>)}
    </ol>
    <div className="pf-week-stats">
      <div className="pf-week-ring">
        <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
          <circle cx="32" cy="32" r={radius} className="pf-goal-track" />
          {goal && goal.done > 0 && <circle cx="32" cy="32" r={radius} className="pf-goal-fill" strokeDasharray={`${(goal.percent / 100) * circumference} ${circumference}`} transform="rotate(-90 32 32)" />}
        </svg>
        <span className="pf-week-ring-text"><b>{goal ? `${goal.done}/${goal.planned}` : '–'}</b><small>{t('week.sessionsUnit')}</small></span>
      </div>
      <dl>
        <div><dt>{t('week.minutes')}</dt><dd>{goal?.minutes ?? 0}</dd></div>
        {progress.streakWeeks > 0
          ? <div><dt>{t('week.streak')}</dt><dd>{progress.streakWeeks}</dd></div>
          : <div><dt>{t('week.total')}</dt><dd>{progress.done}/{progress.total}</dd></div>}
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

export type HomeTournament = { id: string; name: string; location: string | null; start_date: string; end_date?: string | null; fee: number | null }

export function OpenTournaments({ tournaments }: { tournaments: HomeTournament[] }) {
  const t = useTranslations('profileHome')
  const locale = useLocale()
  if (tournaments.length === 0) return null
  return <section className="pf-card" aria-labelledby="pf-open">
    <div className="pf-card-head">
      <h2 id="pf-open" className="pf-card-title">{t('open.title')}</h2>
      <Link href="/tournaments" className="pf-card-meta tap-44" style={{ textDecoration: 'none' }}>{t('open.viewAll')}</Link>
    </div>
    <ul className="pf-list">
      {tournaments.map(item => {
        const fee = tournamentFee(item.fee)
        return <li key={item.id}>
          <Link href={`/tournaments/${item.id}`} className="pf-open-row">
            <span className="pf-list-main">
              <b>{item.name}</b>
              <span><CalendarDays size={11} aria-hidden="true" style={{ verticalAlign: '-1px' }} /> {tournamentDateRange(locale, item.start_date, item.end_date)}{item.location ? <> · <MapPin size={11} aria-hidden="true" style={{ verticalAlign: '-1px' }} /> {item.location}</> : null}</span>
            </span>
            <span className="pf-badge is-ok">{fee ? t('open.perTeam', { fee }) : t('open.free')}</span>
          </Link>
        </li>
      })}
    </ul>
  </section>
}
