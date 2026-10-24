import Link from 'next/link'
import { useTranslations } from 'next-intl'

// /team-members/[teamId] is the head coach's and accepted assistants' page. An athlete or a
// guardian who opens it (from a shared link) is told where their team's things are, instead
// of the site-wide "field not found" (QA B on Production, 18 Oct 2026).
export default function TeamNotFound() {
  const t = useTranslations('teamPage')
  return (
    <main className="site-fallback">
      <p className="site-fallback-kicker">DOENSAI.COM · 404</p>
      <h1>{t('notFoundTitle')}</h1>
      <p>{t('notFoundBody')}</p>
      <div className="site-fallback-actions">
        <Link href="/team-members">{t('notFoundBack')}</Link>
      </div>
    </main>
  )
}
