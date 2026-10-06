import Link from 'next/link'
import { useTranslations } from 'next-intl'

// What /team-members shows to someone with no team and no invitation: a coach is pointed at
// the tournaments, an athlete is told where a coach's invitation will appear (UX mockup v3-B).
export default function NoTeamYet() {
  const t = useTranslations('teamMembersEmpty')
  return <section className="ui-card" style={{ padding: '28px 20px', textAlign: 'center' }}>
    <p className="ui-eyebrow" style={{ letterSpacing: 0, textTransform: 'none', fontSize: 13 }}>{t('eyebrow')}</p>
    <h2 className="ui-h1" style={{ margin: '6px 0 8px' }}>{t('title')}</h2>
    <p style={{ margin: '0 auto 20px', maxWidth: 380, color: 'var(--ui-mute)', fontSize: 15, lineHeight: 1.6 }}>{t('text')}</p>
    <Link className="ui-btn ui-btn-primary" href="/tournaments" style={{ margin: '0 auto', maxWidth: 360 }}>{t('cta')}</Link>
    <p style={{ margin: '14px 0 0', color: 'var(--ui-mute)', fontSize: 13 }}>{t('athleteHint')}</p>
  </section>
}
