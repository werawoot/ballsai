import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import PageHeader from '@/components/PageHeader'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { fetchTournamentFixtures, type StoredFixture } from '@/lib/fixture-draw'
import FixtureDrawForm from './FixtureDrawForm'

// An organizer's draw for one tournament: make or remake it, and see every fixture by
// stage, group and round. Only the tournament's organizer or an admin gets here; the
// database checks the same again when a draw is saved (sql/55).
export default async function TournamentFixturesPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/dashboard/tournaments/${params.id}/fixtures`)

  const [t, header, { data: profile }, { data: tournament }] = await Promise.all([
    getTranslations('fixtures'),
    getTranslations('header'),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('tournaments').select('id, name, organizer_id').eq('id', params.id).maybeSingle(),
  ])
  const isAdmin = profile?.role === 'admin'
  const allowed = tournament && (isAdmin || tournament.organizer_id === user.id)

  const page = (children: React.ReactNode) => (
    <main className="bds-page" style={{ background: '#f8f8f8', minHeight: '100vh', paddingBottom: 40 }}>
      <PageHeader back={{ href: '/dashboard', label: header('back.dashboard') }} />
      <div className="bds-hero" style={{ background: '#CC0001', padding: '20px 16px 30px' }}>
        <p style={{ color: 'rgba(255,255,255,.75)', fontSize: 11, fontWeight: 800, letterSpacing: 1.2, margin: 0 }}>{t('eyebrow')}</p>
        <h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 'clamp(26px,7vw,40px)', color: 'white', margin: '6px 0 0', lineHeight: 1.05 }}>{tournament?.name ?? t('title')}</h1>
      </div>
      <div style={{ padding: 16, display: 'grid', gap: 16, maxWidth: 820, margin: '0 auto' }}>{children}</div>
    </main>
  )

  if (!allowed) return page(<p role="alert" style={{ background: '#fff0f0', borderLeft: '3px solid #d71920', color: '#9b1d27', fontSize: 13, padding: '10px 12px', margin: 0 }}>{t('notFound')}</p>)

  const [{ count: confirmedCount }, stored] = await Promise.all([
    supabase.from('teams').select('id', { count: 'exact', head: true }).eq('tournament_id', params.id).eq('status', 'confirmed'),
    fetchTournamentFixtures(supabase, params.id),
  ])
  const locked = stored.fixtures.some(fixture => fixture.match_result_id)

  const side = (teamId: string | null, source: string | null) => {
    if (teamId) return stored.teamNames[teamId] ?? '—'
    const [kind, ...rest] = (source ?? '').split(':')
    if (kind === 'winner') {
      // Keys read KO-R2-M1; organizers see "round 2, match 1", not the key.
      const [, round = '?', match = '?'] = rest[0]?.match(/R(\d+)-M(\d+)$/) ?? []
      return t('winnerOf', { round, match })
    }
    if (kind === 'group') return t('groupPlace', { group: rest[0], position: rest[1] })
    return '—'
  }
  const sections = new Map<string, StoredFixture[]>()
  for (const fixture of stored.fixtures) {
    const title = fixture.stage === 'group' ? t('stageGroup', { group: fixture.group_label ?? '' }) : fixture.stage === 'league' ? t('stageLeague') : t('stageKnockout')
    const key = `${title} · ${t('round', { round: fixture.round })}`
    sections.set(key, [...(sections.get(key) ?? []), fixture])
  }

  return page(<>
    <p style={{ margin: 0, fontSize: 13, color: '#555', fontWeight: 700 }}>{t('teamsReady', { count: confirmedCount ?? 0 })}</p>
    {stored.migrationMissing
      ? <p role="status" style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 10, padding: '12px 14px', fontSize: 13, margin: 0 }}>{t('migrationMissing')}</p>
      : <FixtureDrawForm tournamentId={params.id} hasDraw={stored.fixtures.length > 0} locked={locked} />}
    {stored.failed && <p role="alert" style={{ color: '#9b1d27', fontSize: 13, margin: 0 }}>{t('loadFailed')}</p>}
    {!stored.migrationMissing && !stored.failed && stored.fixtures.length === 0 && <p style={{ color: '#888', fontSize: 13, margin: 0 }}>{t('none')}</p>}
    {[...sections].map(([title, fixtures]) => (
      <section key={title} aria-label={title} style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e5e5e5', padding: '12px 14px' }}>
        <h2 style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, color: '#CC0001', margin: '0 0 8px' }}>{title}</h2>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {fixtures.map(fixture => (
            <li key={fixture.fixture_key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', gap: 8, alignItems: 'center', fontSize: 13, padding: '8px 0', borderTop: '1px solid #f0f0f0' }}>
              <span style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{side(fixture.home_team_id, fixture.home_source)}</span>
              <span style={{ color: '#aaa', fontSize: 11 }}>{t('versus')}</span>
              <span style={{ fontWeight: 700, textAlign: 'right', overflowWrap: 'anywhere' }}>{side(fixture.away_team_id, fixture.away_source)}</span>
            </li>
          ))}
        </ol>
      </section>
    ))}
  </>)
}
