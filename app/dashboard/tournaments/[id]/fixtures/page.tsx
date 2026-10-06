import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import PageHeader from '@/components/PageHeader'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import FixtureBoard from '@/components/FixtureBoard'
import { fetchTournamentFixtures } from '@/lib/fixture-draw'
import { recordableFixtureKeys, recordResultHref } from '@/lib/fixture-record'
import FixtureDrawForm from './FixtureDrawForm'
import PenaltyWinnerButtons from './PenaltyWinnerButtons'
import PublishFixturesToggle from './PublishFixturesToggle'

// An organizer's draw for one tournament: make or remake it, and see every fixture by
// stage, group and round. Only the tournament's organizer or an admin gets here; the
// database checks the same again when a draw is saved (sql/55).
export default async function TournamentFixturesPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
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
      <div style={{ margin: '0 auto', maxWidth: 820, padding: '22px 16px 0' }}>
        <p className="ui-eyebrow" style={{ letterSpacing: 0, textTransform: 'none', fontSize: 13 }}>{t('eyebrow')}</p>
        <h1 className="ui-h1" style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>{tournament?.name ?? t('title')}</h1>
      </div>
      <div style={{ padding: 16, display: 'grid', gap: 16, maxWidth: 820, margin: '0 auto' }}>{children}</div>
    </main>
  )

  if (!allowed) return page(<p role="alert" style={{ background: '#fff0f0', borderLeft: '3px solid #d71920', color: '#9b1d27', fontSize: 13, padding: '10px 12px', margin: 0 }}>{t('notFound')}</p>)

  const [{ count: confirmedCount }, stored, publishing] = await Promise.all([
    supabase.from('teams').select('id', { count: 'exact', head: true }).eq('tournament_id', params.id).eq('status', 'confirmed'),
    fetchTournamentFixtures(supabase, params.id),
    // sql/57 adds the column; before it, publishing is simply not offered.
    supabase.from('tournaments').select('fixtures_published_at').eq('id', params.id).maybeSingle(),
  ])
  const canPublish = !publishing.error && stored.fixtures.length > 0
  const publishedAt = (publishing.data as { fixtures_published_at?: string | null } | null)?.fixtures_published_at ?? null
  const locked = stored.fixtures.some(fixture => fixture.match_result_id)
  const recordable = recordableFixtureKeys(stored.fixtures)

  return page(<>
    <p style={{ margin: 0, fontSize: 13, color: '#555', fontWeight: 700 }}>{t('teamsReady', { count: confirmedCount ?? 0 })}</p>
    {stored.migrationMissing
      ? <p role="status" style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 10, padding: '12px 14px', fontSize: 13, margin: 0 }}>{t('migrationMissing')}</p>
      : <FixtureDrawForm tournamentId={params.id} hasDraw={stored.fixtures.length > 0} locked={locked} />}
    {stored.failed && <p role="alert" style={{ color: '#9b1d27', fontSize: 13, margin: 0 }}>{t('loadFailed')}</p>}
    {canPublish && <PublishFixturesToggle tournamentId={params.id} published={Boolean(publishedAt)} />}
    {!stored.migrationMissing && !stored.failed && stored.fixtures.length === 0 && <p style={{ color: '#888', fontSize: 13, margin: 0 }}>{t('none')}</p>}
    <FixtureBoard draw={stored} renderAction={fixture => recordable.has(fixture.fixture_key) && (
      <Link className="ui-btn ui-btn-ghost ui-btn-sm" href={recordResultHref(params.id, fixture)} style={{ gridColumn: '1 / -1' }}>{t('record')}</Link>
    )} renderExtra={fixture => fixture.home_team_id && fixture.away_team_id && (
      <PenaltyWinnerButtons tournamentId={params.id} fixtureKey={fixture.fixture_key} teams={[
        { id: fixture.home_team_id, name: stored.teamNames[fixture.home_team_id] ?? '—' },
        { id: fixture.away_team_id, name: stored.teamNames[fixture.away_team_id] ?? '—' },
      ]} />
    )} />
  </>)
}
