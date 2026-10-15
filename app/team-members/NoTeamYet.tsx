import Link from 'next/link'
import { useTranslations } from 'next-intl'

// What /team-members shows to someone with no team and no invitation: something to do now,
// alone (the training programmes), where a coach's invitation will appear, and the
// tournaments as a coach's way in (UX mockup v3-B, report 11).
export default function NoTeamYet() {
  const t = useTranslations('teamMembersEmpty')
  return <section className="ui-card tm-empty">
    <p className="ui-eyebrow tm-empty-eyebrow">{t('eyebrow')}</p>
    <h2 className="ui-h1">{t('title')}</h2>
    <p className="tm-empty-text">{t('text')}</p>
    <Link className="ui-btn ui-btn-primary tm-empty-cta" href="/training">{t('cta')}</Link>
    <p className="tm-empty-hint">{t('athleteHint')}</p>
    <p className="tm-empty-hint"><Link href="/tournaments" className="tm-empty-link">{t('coachHint')}</Link></p>
  </section>
}
