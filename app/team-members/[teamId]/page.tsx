import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BarChart3, CalendarDays, ClipboardList, Gauge, Megaphone } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { teamMatchIds, teamSeasonStats, teamSheet, type MatchRow, type PerformanceRow, type RankLink, type TeamMember } from '@/lib/team-stats'
import TeamSheetActions from './TeamSheetActions'
import CoachSkillPanel, { type LatestProposal } from './CoachSkillPanel'
import { COACH_SKILL_KEYS, latestProposals, type CoachSkills, type ProposalRow, type ProposalStatus } from '@/lib/coach-skills'
import TeamEventsPanel, { type PanelEvent } from './TeamEventsPanel'
import TeamNewsPanel, { type SentAnnouncement } from './TeamNewsPanel'
import { attendanceOpen, attendanceRates, splitEvents, type EventKind } from '@/lib/team-events'
import '../team-page.css'

// One team, for the coach who created it: this season's numbers per member and the team
// sheet to send an organizer or share in LINE (lib/team-stats). Reads only what RLS already
// lets the coach see, through indexed lookups: the tournament's matches
// (match_results_tournament_created_idx), then the performances of those matches
// (match_player_performances_match_idx). A team plays in one tournament, so this stays a
// few hundred rows however many teams the country has.

type TeamRow = { id: string; name: string; tournament_id: string | null; tournaments: { name: string; start_date: string | null } | null }
type EventRow = { id: string; kind: EventKind; title: string; starts_at: string; location: string | null; cancelled_at: string | null }
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

  const [{ data: rosterRows, error: rosterError }, { data: matchRows, error: matchError }, { data: proposalRows, error: proposalError }, { data: newsRows, error: newsError }, { data: eventRows, error: eventError }] = await Promise.all([
    supabase.from('team_members').select('athlete_id, athlete_profiles(display_name, position)').eq('team_id', teamId).eq('status', 'accepted'),
    typedTeam.tournament_id
      ? supabase.from('match_results').select('id, team_a_id, team_b_id, status').eq('tournament_id', typedTeam.tournament_id).eq('status', 'confirmed').or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
      : Promise.resolve({ data: [], error: null }),
    // This coach's skill ratings for the team (sql/69; RLS shows the coach their own).
    // Before SQL69 the table is missing and the panel says the feature is not on yet.
    supabase.from('coach_skill_assessments').select('athlete_id, status, created_at, speed, stamina, strength, technique, vision').eq('team_id', teamId).order('created_at', { ascending: false }).limit(200),
    // Team events from 30 days back (sql/70; team_events_team_starts_idx). The save
    // function caps a team at 200 upcoming events, so this read is bounded too.
    // The coach's last ten announcements (sql/71; team_announcements_team_created_idx).
    supabase.from('team_announcements').select('id, body, created_at, to_athletes, to_guardians').eq('team_id', teamId).order('created_at', { ascending: false }).limit(10),
    supabase.from('team_events').select('id, kind, title, starts_at, location, cancelled_at').eq('team_id', teamId).gte('starts_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).order('starts_at', { ascending: true }).limit(250),
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

  // Read counts for those announcements: one row per recipient (a team and its guardians).
  const news = (newsRows ?? []) as { id: string; body: string; created_at: string; to_athletes: boolean; to_guardians: boolean }[]
  const { data: recipientRows } = news.length
    ? await supabase.from('team_announcement_recipients').select('announcement_id, read_at').in('announcement_id', news.map(item => item.id))
    : { data: [] }
  const reads: Record<string, { read: number; total: number }> = {}
  for (const row of (recipientRows ?? []) as { announcement_id: string; read_at: string | null }[]) {
    const count = (reads[row.announcement_id] ??= { read: 0, total: 0 })
    count.total += 1
    if (row.read_at) count.read += 1
  }
  const sent: SentAnnouncement[] = news.map(item => ({
    id: item.id, body: item.body, createdAt: item.created_at, toAthletes: item.to_athletes, toGuardians: item.to_guardians,
    read: reads[item.id]?.read ?? 0, total: reads[item.id]?.total ?? 0,
  }))
  const events = (eventRows ?? []) as EventRow[]
  const eventIds = events.map(event => event.id)
  const [{ data: responseRows }, { data: attendanceRows }, { data: seasonAttendanceRows }] = eventIds.length
    ? await Promise.all([
        supabase.from('team_event_responses').select('event_id, athlete_id, answer').in('event_id', eventIds),
        supabase.from('team_event_attendance').select('event_id, athlete_id, present').in('event_id', eventIds),
        // Attendance for the season column: every recorded session of this team, one
        // row per member per session (members x sessions; a season is a few thousand).
        supabase.from('team_event_attendance').select('athlete_id, present, team_events!inner(team_id)').eq('team_events.team_id', teamId).limit(5000),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]
  const answersByEvent: Record<string, Record<string, 'yes' | 'no'>> = {}
  for (const row of (responseRows ?? []) as { event_id: string; athlete_id: string; answer: 'yes' | 'no' }[]) (answersByEvent[row.event_id] ??= {})[row.athlete_id] = row.answer
  const presentByEvent: Record<string, string[]> = {}
  for (const row of (attendanceRows ?? []) as { event_id: string; athlete_id: string; present: boolean }[]) {
    const list = (presentByEvent[row.event_id] ??= [])
    if (row.present) list.push(row.athlete_id)
  }
  const now = Date.now()
  const toPanel = (event: EventRow): PanelEvent => ({
    id: event.id, kind: event.kind, title: event.title, startsAt: event.starts_at, location: event.location,
    answers: answersByEvent[event.id] ?? {}, present: presentByEvent[event.id] ?? null, attendanceOpen: attendanceOpen(event.starts_at, now),
  })
  const split = splitEvents(events, now)
  const rates = attendanceRates((seasonAttendanceRows ?? []) as { athlete_id: string; present: boolean }[])

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
  const [ts, te, tn] = await Promise.all([getTranslations('coachSkills'), getTranslations('teamEvents'), getTranslations('teamNews')])

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
                  <thead><tr><th scope="col">{t('colName')}</th><th scope="col">{t('colMatches')}</th><th scope="col">{t('colGoals')}</th><th scope="col">{t('colAssists')}</th><th scope="col">{t('colMvps')}</th><th scope="col">{te('colAttendance')}</th></tr></thead>
                  <tbody>{stats.map(row => <tr key={row.athleteId}>
                    <th scope="row">{row.name}{row.position && <small>{row.position}</small>}</th>
                    <td>{dash(row.matches)}</td><td>{dash(row.goals)}</td><td>{dash(row.assists)}</td><td>{dash(row.mvps)}</td><td>{rates[row.athleteId] ? `${rates[row.athleteId].percent}%` : '—'}</td>
                  </tr>)}</tbody>
                </table>
                <p className="tp-note">{t('statsNote')}</p>
              </div>}
        </section>

        <section className="tp-section" aria-labelledby="tp-news">
          <div className="tp-head"><h2 id="tp-news"><Megaphone size={18} aria-hidden="true" />{tn('title')}</h2></div>
          <TeamNewsPanel teamId={teamId} sent={sent} ready={!newsError} />
        </section>

        <section className="tp-section" aria-labelledby="tp-events">
          <div className="tp-head"><h2 id="tp-events"><CalendarDays size={18} aria-hidden="true" />{te('title')}</h2></div>
          <TeamEventsPanel teamId={teamId} members={roster.map(member => ({ athleteId: member.athleteId, name: member.name }))} upcoming={split.upcoming.map(toPanel)} past={split.past.map(toPanel)} ready={!eventError} />
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
