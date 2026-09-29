import { createClient } from '@supabase/supabase-js'
import { getTranslations } from 'next-intl/server'
import PageHeader from '@/components/PageHeader'
import FixtureBoard from '@/components/FixtureBoard'
import { fetchPublicDraw } from '@/lib/fixture-draw'

// A tournament's fixtures, results and tables for everyone, once its organizer has
// published them (sql/57). Read with the anonymous key: what a signed-out visitor sees
// is exactly what this page shows, whoever is looking.
export const revalidate = 60

export default async function PublicFixturesPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const [t, { draw, migrationMissing, failed }] = await Promise.all([
    getTranslations('fixtures'),
    fetchPublicDraw(client, params.id),
  ])

  return (
    <main className="bds-page" style={{ background: '#f8f8f8', minHeight: '100vh', paddingBottom: 40 }}>
      <PageHeader back={{ href: `/tournaments/${params.id}`, label: t('backToTournament') }} />
      <div className="bds-hero" style={{ background: '#111827', padding: '20px 16px 28px' }}>
        <p style={{ color: '#f4b942', fontSize: 11, fontWeight: 800, letterSpacing: 1.2, margin: 0 }}>{t('eyebrow')}</p>
        <h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 'clamp(26px,7vw,40px)', color: 'white', margin: '6px 0 0', lineHeight: 1.05 }}>{t('publicTitle')}</h1>
      </div>
      <div style={{ padding: 16, display: 'grid', gap: 16, maxWidth: 820, margin: '0 auto' }}>
        {draw
          ? <FixtureBoard draw={draw} />
          : <p role="status" style={{ background: 'white', border: '1.5px solid #e5e5e5', borderRadius: 14, padding: 20, color: '#666', fontSize: 14, margin: 0 }}>
            {migrationMissing || failed ? t('publicUnavailable') : t('notPublished')}
          </p>}
      </div>
    </main>
  )
}
