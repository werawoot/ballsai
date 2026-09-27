import Link from 'next/link'
import { useTranslations } from 'next-intl'

export default function NotFound() {
  const t = useTranslations('fallback')
  return (
    <main className="site-fallback">
      <p className="site-fallback-kicker">BALLDOENSAI.COM · 404</p>
      <h1>{t('notFoundTop')}<br /><em>{t('notFoundBottom')}</em></h1>
      <p>{t('notFoundBody')}</p>
      <div className="site-fallback-actions">
        <Link href="/athletes">{t('findAthletes')}</Link>
        <Link href="/">{t('home')}</Link>
      </div>
    </main>
  )
}
