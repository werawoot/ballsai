import { useTranslations } from 'next-intl'
import { UsersRound } from 'lucide-react'
import { staffByTeam, type MyTeamStaffRow } from '@/lib/team-staff'
import './team-page.css'

// Every adult on the staff of the athlete's teams and their children's teams (sql/75,
// my_team_staff), head coach first, so a family knows who works with their child.
export default function MyTeamStaffPanel({ rows }: { rows: MyTeamStaffRow[] }) {
  const t = useTranslations('teamStaff')
  if (!rows.length) return null
  return (
    <section className="ui-card me-card" aria-labelledby="me-team-staff">
      <h2 id="me-team-staff"><UsersRound size={17} aria-hidden="true" /> {t('familyTitle')}</h2>
      {staffByTeam(rows).map(team => <article className="me-item" key={team.teamId}>
        <span className="me-for">{t('fromTeam', { team: team.teamName })}</span>
        <ul className="ts-list">
          {team.staff.map((person, index) => <li key={`${team.teamId}-${index}`}><span className="ts-who"><b>{person.name || t('unnamed')}</b><small>{person.isHead ? t('head') : t('assistant')}</small></span></li>)}
        </ul>
      </article>)}
      <p className="tp-note">{t('familyNote')}</p>
    </section>
  )
}
