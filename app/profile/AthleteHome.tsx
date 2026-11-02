import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { CalendarDays, Check, ChevronRight, MapPin } from 'lucide-react'
import { radarPoints, type Mission, type VerifiedSkills, type WeeklyGoal } from '@/lib/athlete-home'
import { tournamentDateRange, tournamentFee } from '@/lib/tournament-dates'

// The parts of the athlete's "ของฉัน" from the DOENSAI dashboard design (owner, 2 Nov 2026).
// What each shows is decided in lib/athlete-home.ts; these only draw it. None of them holds the
// page's one primary button: a mission points at the card on this page that does the work.

export function MissionsCard({ missions }: { missions: Mission[] }) {
  const t = useTranslations('profileHome')
  if (missions.length === 0) return null
  const done = missions.filter(mission => mission.done).length
  return <section className="pf-card pf-missions" aria-labelledby="pf-missions">
    <div className="pf-card-head">
      <h2 id="pf-missions" className="pf-card-title">{t('missions.title')}</h2>
      <span className="pf-card-meta">{t('missions.progress', { done, total: missions.length })}</span>
    </div>
    <ul className="pf-mission-list">
      {missions.map(mission => {
        const title = mission.key === 'profileStep'
          ? `${t('missions.items.profileStep')}: ${t(`readiness.items.${mission.step}.title`)}`
          : t(`missions.items.${mission.key}`)
        const meta = mission.key === 'train' ? t('missions.items.trainMeta', { minutes: mission.minutes })
          : mission.key === 'answerInvites' ? t('missions.items.answerInvitesMeta', { count: mission.count })
          : mission.key === 'rest' ? t('missions.items.restMeta')
          : mission.key === 'pickProgram' ? t('missions.items.pickProgramMeta')
          : mission.key === 'openTournament' ? t('missions.items.openTournamentMeta')
          : null
        return <li key={mission.key} className={mission.done ? 'is-done' : undefined}>
          <a href={`#${mission.target}`}>
            <span className="pf-mission-check" aria-hidden="true">{mission.done && <Check size={15} strokeWidth={3} />}</span>
            <span className="pf-mission-body"><b>{title}</b>{meta && <small>{meta}</small>}</span>
            <span className="pf-sr">{mission.done ? t('missions.done') : t('missions.todo')}</span>
            <ChevronRight size={16} aria-hidden="true" />
          </a>
        </li>
      })}
    </ul>
    <p className="pf-note">{t('missions.note')}</p>
  </section>
}

export function WeekGoal({ goal }: { goal: WeeklyGoal }) {
  const t = useTranslations('profileHome')
  const radius = 22
  const circumference = 2 * Math.PI * radius
  return <div className="pf-goal">
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
      <circle cx="28" cy="28" r={radius} className="pf-goal-track" />
      {goal.done > 0 && <circle cx="28" cy="28" r={radius} className="pf-goal-fill" strokeDasharray={`${(goal.percent / 100) * circumference} ${circumference}`} transform="rotate(-90 28 28)" />}
    </svg>
    <div>
      <small>{t('weekGoal.title')}</small>
      <b>{t('weekGoal.value', { done: goal.done, planned: goal.planned })}</b>
      <small>{t('weekGoal.note')}</small>
    </div>
  </div>
}

export function SkillRadar({ skills }: { skills: VerifiedSkills | null }) {
  const t = useTranslations('profileHome')
  const names = useTranslations('player.skillNames')
  const locale = useLocale()
  if (!skills) return <div className="pf-skills is-empty">
    <b className="pf-skills-title">{t('skills.title')}</b>
    <p className="pf-note">{t('skills.empty')}</p>
  </div>
  const size = 180
  const radius = 62
  const values = skills.skills.map(([, value]) => value)
  const shape = radarPoints(values, radius).map(point => `${point.x},${point.y}`).join(' ')
  const rim = radarPoints(values.map(() => 99), radius)
  const labels = radarPoints(values.map(() => 99), radius + 18)
  const date = new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(skills.date))
  const list = skills.skills.map(([key, value]) => `${names(key)} ${value}`).join(', ')
  return <div className="pf-skills">
    <b className="pf-skills-title">{t('skills.title')}</b>
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
  </div>
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
