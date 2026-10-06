import Link from 'next/link'
import { useTranslations } from 'next-intl'
import PageHeader from '@/components/PageHeader'

// What an account without organizer access sees at /dashboard and /dashboard/results instead
// of being sent back to the home page with no word (UX mockup v4-A). Organizer access is
// turned on by an admin, so this says so and points at what the account can do now. There is
// no contact button: no channel for asking has been chosen yet.
export default function NotOrganizer() {
  const t = useTranslations('notOrganizer')
  return <main className="bds-page" style={{ minHeight: '100vh' }}>
    <PageHeader />
    <div style={{ margin: '0 auto', maxWidth: 560, padding: '28px 18px 40px' }}>
      <p className="ui-eyebrow" style={{ letterSpacing: 0, textTransform: 'none', fontSize: 13 }}>{t('eyebrow')}</p>
      <h1 className="ui-h1" style={{ margin: '6px 0 10px', overflowWrap: 'anywhere' }}>{t('title')}</h1>
      <p style={{ color: 'var(--ui-mute)', fontSize: 15, lineHeight: 1.65, margin: 0 }}>{t('text')}</p>
      <p style={{ color: 'var(--ui-mute)', fontSize: 15, lineHeight: 1.65, margin: '16px 0 28px' }}>{t('meanwhile')}</p>
      <Link className="ui-btn ui-btn-primary" href="/tournaments">{t('cta')}</Link>
    </div>
  </main>
}
