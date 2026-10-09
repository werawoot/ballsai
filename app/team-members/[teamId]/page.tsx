import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BarChart3, ClipboardList, Gauge } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { teamMatchIds, teamSeasonStats, teamSheet, type MatchRow, type PerformanceRow, type RankLink, type TeamMember } from '@/lib/team-stats'
import TeamSheetActions from './TeamSheetActions'
import CoachSkillPanel, { type LatestProposal } from './CoachSkillPanel'
import { COACH_SKILL_KEYS, latestProposals, type CoachSkills, type ProposalRow, type ProposalStatus } from '@/lib/coach-skills'
import '../team-page.css'

// One team, for the coach who created it: this season's numbers per member and the team
// sheet to send an organizer or share in LINE (lib/team-stats). Reads only what RLS already
// lets the coach see, through indexed lookups: the tournament's matches
// (match_results_tournament_created_idx), then the performances of those matches
// (match_player_performances_match_idx). A team plays in one tournament, so this stays a
// few hundred rows however many teams the country has.

type TeamRow = { id: string; name: string; tournament_id: string | null; tournaments: { name: string; start_date: string | null } | null }
type RosterRow = { athlete_id: string; athlete_profiles: { display_name: string | null; position: string | null } | null }

export default async function TeamPage(props: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await props.params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/team-members/${encodeURIComponent(teamId)}`)
  const t = await getTranslations('teamPage')

  const { data: team } = await supabase.from('teams').select('id, name, tournament_id, tournaments(name, start_date)').eq('id', teamId).eq('created_by', user.id).maybeSingle()
  if (!team) notFound()
  const typedTeam = team as unknown as TeamRow

  const [{ data: rosterRows, error: rosterError }, { data: matchRows, error: matchError }, { data: proposalRows, error: proposalError }] = await Promise.all([
    supabase.from('team_members').select('athlete_id, athlete_profiles(display_name, position)').eq('team_id', teamId).eq('status', 'accepted'),
    typedTeam.tournament_id
      ? supabase.from('match_results').select('id, team_a_id, team_b_id, status').eq('tournament_id', typedTeam.tournament_id).eq('status', 'confirmed').or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
      : Promise.resolve({ data: [], error: null }),
    // This coach's skill ratings for the team (sql/69; RLS shows the coach their own).
    // Before SQL69 the table is missing and the panel says the feature is not on yet.
    supabase.from('coach_skill_assessments').select('athlete_id, status, created_at, speed, stamina, strength, technique, vision').eq('team_id', teamId).order('created_at', { ascending: false }).limit(200),
  ])
  const roster: TeamMember[] = ((rosterRows ?? []) as unknown as RosterRow[]).map(row => ({
    athleteId: row.athlete_id,
    name: row.athlete_profiles?.display_name?.trim() || t('unnamed'),
    position: row.athlete_profiles?.position ?? null,
  }))
  const matchIds = teamMatchIds((matchRows ?? []) as MatchRow[], teamId)
  const { data: performanceRows, error: performanceError } = matchIds.length
    ? await supabase.from('match_player_performances').select('player_rank_id, goals, assists, mvp').in('match_result_id', matchIds).eq('team_id', teamId)
    : { data: [], error: null }
  const rankIds = [...new Set(((performanceRows ?? []) as PerformanceRow[]).map(row => row.player_rank_id))]
  const { data: rankRows } = rankIds.length ? await supabase.from('player_ranks').select('id, player_id').in('id', rankIds) : { data: [] }

  const stats = teamSeasonStats(roster, (performanceRows ?? []) as PerformanceRow[], (rankRows ?? []) as RankLink[])
  const sheet = teamSheet(roster)
  const failed = Boolean(rosterError || matchError || performanceError)
  const dash = (value: number | null) => (value === null ? '—' : value)
  const tournamentName = typedTeam.tournaments?.name ?? null
  const latest: Record<string, LatestProposal> = Object.fromEntries(Object.entries(latestProposals((proposalRows ?? []) as ProposalRow[])).map(([athleteId, row]) => [athleteId, {
    status: row.status as ProposalStatus,
    createdAt: row.created_at,
    skills: Object.fromEntries(COACH_SKILL_KEYS.map(key => [key, row[key] ?? null])) as CoachSkills,
  }]))
  const ts = await getTranslations('coachSkills')

  return (
    <main className="bds-page ui-matchday tp">
      <PageHeader back={{ href: '/team-members', label: t('back') }} />
      <div className="tp-wrap">
        <p className="ui-eyebrow">{tournamentName ?? t('noTournament')}</p>
        <h1 className="tp-title">{typedTeam.name}</h1>
        {failed && <p className="tp-alert" role="alert">{t('loadFailed')}</p>}

        <section className="tp-section" aria-labelledby="tp-stats">
          <div className="tp-head"><h2 id="tp-stats"><BarChart3 size={18} aria-hidden="true" />{t('statsTitle')}</h2><span className="ui-chip is-performance">{t('statsSource')}</span></div>
          {roster.length === 0
            ? <p className="tp-empty">{t('noMembers')} <Link href="/team-members">{t('inviteLink')}</Link></p>
            : <div className="ui-card tp-table-card">
                <table className="tp-table">
                  <thead><tr><th scope="col">{t('colName')}</th><th scope="col">{t('colMatches')}</th><th scope="col">{t('colGoals')}</th><th scope="col">{t('colAssists')}</th><th scope="col">{t('colMvps')}</th></tr></thead>
                  <tbody>{stats.map(row => <tr key={row.athleteId}>
                    <th scope="row">{row.name}{row.position && <small>{row.position}</small>}</th>
                    <td>{dash(row.matches)}</td><td>{dash(row.goals)}</td><td>{dash(row.assists)}</td><td>{dash(row.mvps)}</td>
                  </tr>)}</tbody>
                </table>
                <p className="tp-note">{t('statsNote')}</p>
              </div>}
        </section>

        {roster.length > 0 && <section className="tp-section" aria-labelledby="tp-skills">
          <div className="tp-head"><h2 id="tp-skills"><Gauge size={18} aria-hidden="true" />{ts('title')}</h2><span className="ui-chip is-coach">{t('coachChip')}</span></div>
          <CoachSkillPanel teamId={teamId} members={roster.map(member => ({ athleteId: member.athleteId, name: member.name }))} latest={latest} ready={!proposalError} />
        </section>}

        <section className="tp-section" aria-labelledby="tp-sheet">
          <div className="tp-head"><h2 id="tp-sheet"><ClipboardList size={18} aria-hidden="true" />{t('sheetTitle')}</h2></div>
          {sheet.length === 0
            ? <p className="tp-empty">{t('noMembers')}</p>
            : <>
                <div className="tp-sheet" id="team-sheet">
                  <b className="tp-sheet-team">{typedTeam.name}</b>
                  {tournamentName && <span className="tp-sheet-meta">{tournamentName}</span>}
                  <ol className="tp-sheet-list">{sheet.map(row => <li key={row.no}><span>{row.no}</span><b>{row.name}</b><em>{row.position ?? '—'}</em></li>)}</ol>
                  <small className="tp-sheet-foot">{t('sheetPrivacy')}</small>
                </div>
                <TeamSheetActions teamName={typedTeam.name} tournamentName={tournamentName} rows={sheet} />
              </>}
        </section>
      </div>
    </main>
  )
}
