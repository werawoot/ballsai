import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Bell, ChevronRight } from 'lucide-react'
import { radarPoints, type VerifiedSkills, type WeekTotals } from '@/lib/athlete-home'
import { unreadBadge } from '@/lib/notification-unread'
import { SKILL_KEYS } from '@/lib/skill-ratings'
import type { CardSkills } from '@/lib/athlete-home-data'

// The athlete's home (/profile) in the DOENSAI dashboard layout (owner, 2 Nov 2026, second
// reference), on the light glass of ADR-014. What each part shows is decided in
// lib/athlete-home.ts; these only draw it. Only the training card holds the page's one
// primary button. Every number has a source; a missing one shows as a dash or not at all.

/** Greeting, the bell and the way to /me, then the level from verified matches. */
export function HomeHero({ name, line, avatarUrl, initials, unread, level }: {
  name: string
  line: string
  avatarUrl: string | null
  initials: string
  unread: number | null
  level: { level: number; xp: number; target: number; percent: number } | null
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
        <p className="pf-tagline" lang="en">{t('home.tagline')}</p>
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
    {level && <div className="pf-lv">
      <div className="pf-lv-row"><b>{t('home.level', { level: level.level })}</b><span>{t('home.xp', { xp: level.xp.toLocaleString('en-US'), target: level.target.toLocaleString('en-US') })}</span></div>
      <div className="pf-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level.percent)} aria-label={t('level', { level: level.level })}><i style={{ width: `${level.percent}%` }} /></div>
    </div>}
  </section>
}

/**
 * "การ์ดของฉัน": the athlete's card in small, all of it one link to /card. The big number is
 * the card's own OVR from the rank row, the five skills a coach or admin assessed; a dash where
 * nobody did. No rank row is a STARTER card and says so (AGENTS.md rule 8).
 */
export function MyCardPanel({ name, team, position, avatarUrl, initials, ovr, skills, power, change, ranked }: {
  name: string
  team: string | null
  position: string | null
  avatarUrl: string | null
  initials: string
  ovr: number | null
  skills: CardSkills | null
  power: number | null
  change: number | null
  ranked: boolean
}) {
  const t = useTranslations('profileHome')
  const value = (input: number | null | undefined) => typeof input === 'number' ? String(input) : '—'
  return <section className="pf-mycard" aria-labelledby="pf-card">
    <Link href="/card" className="pf-mycard-link">
      <span className="pf-mycard-head"><h2 id="pf-card" className="pf-card-title">{t('card.title')}</h2><ChevronRight size={20} aria-hidden="true" /></span>
      <span className="pf-mycard-body">
        <span className={`pf-mini${ranked ? '' : ' is-starter'}`} aria-hidden="true">
          <span className="pf-mini-top"><b>{ranked ? value(ovr) : '—'}</b><small>{position || '—'}</small></span>
          <span className="pf-mini-photo" style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}>{!avatarUrl && initials}</span>
        </span>
        <span className="pf-mycard-info">
          <b className="pf-mycard-name">{name}</b>
          {team && <small className="pf-mycard-team">{team}</small>}
          {ranked
            ? <span className="pf-mycard-stats">{SKILL_KEYS.map(key => <span key={key}><small>{key.toUpperCase()}</small><b>{value(skills?.[key])}</b></span>)}</span>
            : <span className="pf-mycard-starter">{t('card.starterTitle')}</span>}
        </span>
      </span>
      <span className="pf-mycard-foot">
        {ranked && power !== null
          ? <>{t('card.powerLine', { power: power.toLocaleString('en-US') })}{change !== null && <em className={change > 0 ? 'is-up' : 'is-down'}>{t('lastMatch', { change: change > 0 ? `+${change}` : `−${Math.abs(change)}` })}</em>}</>
          : t('card.starterShort')}
      </span>
    </Link>
  </section>
}

/** The week of the athlete's programme: sessions, minutes and skills (self-reported), and XP from verified matches. */
export function WeekProgress({ goal, xp }: { goal: WeekTotals | null; xp: number | null }) {
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
        <div><dd>{goal ? goal.skills : '—'}</dd><dt>{t('week.skills')}</dt></div>
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

