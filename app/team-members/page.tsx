import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import TeamMembersClient from './TeamMembersClient'
import NoTeamYet from './NoTeamYet'
import CoachTeamOverview from './CoachTeamOverview'
import AthleteAttestationInbox from './AthleteAttestationInbox'
import AthleteSkillInbox, { type SkillProposal } from './AthleteSkillInbox'
import MyEventsPanel, { type MyEventRow } from './MyEventsPanel'
import MyNewsPanel, { type MyAnnouncementRow } from './MyNewsPanel'
import MyTrainingPanel, { type MyPlanRow } from './MyTrainingPanel'
import MyCoachNotesPanel, { type MyNoteRow } from './MyCoachNotesPanel'
import MyMinutesPanel, { type MyMinutesRow } from './MyMinutesPanel'
import StaffInvitesPanel from './StaffInvitesPanel'
import MyTeamStaffPanel from './MyTeamStaffPanel'
import type { MyStaffTeamRow, MyTeamStaffRow } from '@/lib/team-staff'
import type { EntryRosterRow } from '@/lib/own-team'
import CreateTeamForm from './CreateTeamForm'
import MyEntriesPanel from './MyEntriesPanel'
import { planToday } from '@/lib/team-training'
import { COACH_SKILL_KEYS, type CoachSkills } from '@/lib/coach-skills'
import {
  coachTeamOverview, latestAttestations,
  type AthleteAttestation, type AttestationRow, type CoachTeamRow, type RosterRow,
} from '@/lib/coach-team-overview'
import Link from 'next/link'
import { rosterProfiles } from '@/lib/roster-names'
import type { ReactNode } from 'react'
import { BellRing, CalendarDays, ClipboardPenLine, Megaphone, ShieldHalf, Timer, Users } from 'lucide-react'
import { teamHub, type TeamHubSection } from '@/lib/team-hub'
import { urgentTeamFirst } from '@/lib/role-home'
import { MY_TEAM_MEMBERSHIPS_LIMIT, fetchMyTeamMemberships, teamNamesById, type MyTeamMembership } from '@/lib/my-team-memberships'
import LeaveTeamButton from './LeaveTeamButton'
import type { ChildTeamRow } from '@/lib/team-join'
import './team-hub.css'
import '../glass.css'
import './team-glass.css'
import { glassSceneStyle, PAGE_PHOTOS } from '@/lib/stock-photos'
import PageHeader from '@/components/PageHeader'

type Member = { id: string; team_id: string; athlete_id: string; status: string; invited_at: string; teams?: { name: string | null } | null }

export default async function TeamMembersPage(props: { searchParams?: Promise<{ team?: string | string[] }> }) {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: values => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/team-members')
  const t = await getTranslations('teamRoster')
  // Own teams (sql/78) add teams.kind; before SQL78 the column is missing, so the list is
  // read again without it and every team is a tournament team, as before.
  const teamsQuery = (columns: string) => supabase.from('teams').select(columns).eq('created_by', user.id).order('created_at', { ascending: false })
  const [teamsFirst, { memberships: invites, failed: invitesError }, { data: profileRow }, { data: entryRows, error: entriesError }] = await Promise.all([
    teamsQuery('id, name, tournament_id, status, kind, tournaments(name, fee)'),
    // The athlete's own invitations and teams, with names (sql/82, lib/my-team-memberships).
    fetchMyTeamMemberships(supabase as never, user.id, MY_TEAM_MEMBERSHIPS_LIMIT),
    supabase.from('profiles').select('role, onboarding_persona, full_name').eq('id', user.id).maybeSingle(),
    // Tournaments a coach entered this athlete or their child in (sql/78, D1).
    supabase.rpc('my_entry_rosters', { p_limit: 50 }),
  ])
  const ownTeamsReady = !teamsFirst.error
  const { data: teamsData, error: teamsError } = ownTeamsReady ? teamsFirst : await teamsQuery('id, name, tournament_id, status, tournaments(name, fee)')
  const teams = teamsData as unknown as { id: string; name: string; tournament_id: string; status: string; kind?: 'club' | 'entry'; tournaments: { name: string | null; fee?: number | null } | null }[] | null
  const myEntries = entriesError ? [] : ((entryRows ?? []) as EntryRosterRow[])
  const persona = (profileRow as { role?: string; onboarding_persona?: string; full_name?: string | null } | null)
  // The name families see in a team's staff list (sql/76); asked for before the first invite.
  const myName = profileRow ? (persona?.full_name?.trim() || null) : undefined
  // Who may create an own team (sql/78, D3): a coach persona, or an organizer or admin.
  const canCreateTeam = ownTeamsReady && (persona?.onboarding_persona === 'coach_organizer' || persona?.role === 'organizer' || persona?.role === 'admin')
  // The roster of the teams this account created, which is a different question from
  // the invitations this account received. RLS scopes both; the team ids are only ever
  // the ones the query above already returned.
  const teamIds = (teams ?? []).map(team => team.id)
  const { data: rosterRows, error: rosterError } = teamIds.length
    ? await supabase.from('team_members')
      .select('id, team_id, athlete_id, status, invited_at')
      .in('team_id', teamIds)
      .order('invited_at', { ascending: true })
    : { data: [], error: null }
  // Names in a second read: team_members cannot embed athlete_profiles (lib/roster-names).
  const names = await rosterProfiles(supabase as never, ((rosterRows ?? []) as { athlete_id: string }[]).map(row => row.athlete_id), teamIds)
  const roster = rosterRows ? (rosterRows as { athlete_id: string }[]).map(row => ({ ...row, athlete_profiles: names.has(row.athlete_id) ? { display_name: names.get(row.athlete_id)?.display_name ?? '' } : null })) : null
  // How many have answered, per team: the submit button says why it waits.
  const countsByTeam: Record<string, { accepted: number; pending: number }> = {}
  for (const row of (roster ?? []) as unknown as { team_id: string; status: string }[]) {
    const count = (countsByTeam[row.team_id] ??= { accepted: 0, pending: 0 })
    if (row.status === 'accepted') count.accepted += 1
    else if (row.status === 'pending') count.pending += 1
  }
  const overview = coachTeamOverview(
    (teams ?? []) as unknown as CoachTeamRow[],
    (roster ?? []) as unknown as RosterRow[],
  )

  // The athlete's own pending and answered attestations. A failure here is surfaced
  // too, rather than silently hiding a request that is waiting on them.
  // No join from coach_id: PostgREST needs a proven, RLS-safe relationship for that,
  // and a coach's name, email or phone is not the athlete's to read. The team is the
  // identifier the athlete already knows, because they accepted its invitation.
  // The coach's id is not joined, and the team row is the coach's: the name comes from the
  // athlete's own memberships (sql/82).
  const myTeamNames = teamNamesById(invites)
  const { data: attestationRows, error: attestationError } = await supabase
    .from('coach_attestations')
    .select('id, team_id, field, claimed_value, status, created_at, teams(name)')
    .eq('athlete_id', user.id)
    .order('created_at', { ascending: false })
  const attestations = (attestationRows ?? []).map(row => ({
    id: row.id as string,
    teamName: (row.teams as { name?: string } | null)?.name ?? myTeamNames.get(row.team_id as string) ?? '',
    field: 'playing_position',
    claimedValue: row.claimed_value,
    status: row.status,
    createdAt: row.created_at,
  })) as unknown as AthleteAttestation[]

  // The coach's own view: the newest attestation state for each of their members, so
  // the form can refuse a duplicate before it is posted.
  const { data: coachAttestationRows, error: coachAttestationError } = teamIds.length
    ? await supabase.from('coach_attestations')
      .select('id, team_id, athlete_id, field, claimed_value, status, created_at')
      .in('team_id', teamIds)
      .order('created_at', { ascending: true })
    : { data: [], error: null }
  // Skill ratings a coach sent this athlete (sql/69), waiting on them. Before SQL69 the
  // table is missing: there is nothing to answer, so nothing is shown.
  const { data: skillRows } = await supabase
    .from('coach_skill_assessments')
    .select('id, team_id, created_at, speed, stamina, strength, technique, vision, teams(name)')
    .eq('athlete_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(20)
  const skillProposals: SkillProposal[] = ((skillRows ?? []) as unknown as (Record<string, unknown> & { id: string; team_id: string; created_at: string; teams: { name?: string } | null })[]).map(row => ({
    id: row.id,
    createdAt: row.created_at,
    teamName: row.teams?.name ?? myTeamNames.get(row.team_id) ?? '',
    skills: Object.fromEntries(COACH_SKILL_KEYS.map(key => [key, (row[key] as number | null) ?? null])) as CoachSkills,
  }))
  // Upcoming team events for this athlete and any child they guard (sql/70). Before SQL70
  // the function is missing: there is nothing to answer, so nothing is shown.
  const { data: myEventRows, error: myEventsError } = await supabase.rpc('my_upcoming_team_events', { p_limit: 30 })
  const myEvents = myEventsError ? [] : ((myEventRows ?? []) as MyEventRow[])
  // A guardian's children's own teams, to leave on a child's behalf (ADR-011, sql/83).
  // Before SQL83 the function is missing and nothing is shown.
  const { data: childTeamRows, error: childTeamsError } = await supabase.rpc('my_children_team_memberships')
  const childTeams = childTeamsError ? [] : ((childTeamRows ?? []) as ChildTeamRow[])
  // Announcements from the athlete's teams (sql/71); nothing before SQL71.
  const { data: newsRows, error: newsError } = await supabase.rpc('my_team_announcements', { p_limit: 10 })
  const myNews = newsError ? [] : ((newsRows ?? []) as MyAnnouncementRow[])
  // This week's and next week's plans of the athlete's teams (sql/72).
  const { data: planRows, error: plansError } = await supabase.rpc('my_team_training_plans')
  const myPlans = plansError ? [] : ((planRows ?? []) as MyPlanRow[])
  const planDay = planToday()
  // Coach notes about the athlete or the children this guardian may act for (sql/73).
  const { data: noteRows, error: notesError } = await supabase.rpc('my_coach_notes', { p_limit: 50 })
  const coachNotes = notesError ? [] : ((noteRows ?? []) as MyNoteRow[])
  // Season minutes recorded by the coach (sql/74); nothing before SQL74.
  const { data: minuteRows, error: minutesError } = await supabase.rpc('my_match_minutes')
  const myMinutes = minutesError ? [] : ((minuteRows ?? []) as MyMinutesRow[])
  // Assistant coaches (sql/75): this account's invitations and teams it helps coach, and
  // the staff of the athlete's own teams. Nothing before SQL75.
  const [{ data: staffTeamRows, error: staffTeamsError }, { data: teamStaffRows, error: teamStaffError }] = await Promise.all([
    supabase.rpc('my_staff_teams'), supabase.rpc('my_team_staff'),
  ])
  const myStaffTeams = staffTeamsError ? [] : ((staffTeamRows ?? []) as MyStaffTeamRow[])
  const myTeamStaff = teamStaffError ? [] : ((teamStaffRows ?? []) as MyTeamStaffRow[])
  const attestationState = latestAttestations(coachAttestationRows as AttestationRow[] | null)
  const ownInvites = (invites ?? []) as unknown as Member[]
  const pendingInvites = ownInvites.filter(row => row.status === 'pending')
  const acceptedInvites = ownInvites.filter(row => row.status === 'accepted')
  const pendingStaff = myStaffTeams.filter(row => row.status === 'pending')
  const acceptedStaff = myStaffTeams.filter(row => row.status === 'accepted')
  // Only a team still in draft takes new invitations; a submitted one is the organizer's.
  const draftTeams = (teams ?? []).filter(team => team.status === 'draft')
  // Open on the team the profile card named (?team=), else on the one that needs the coach
  // most, by the card's own rule, so a ready roster is never behind the team picker.
  const requested = (await props.searchParams)?.team
  const firstTeam = typeof requested === 'string' && draftTeams.some(team => team.id === requested)
    ? requested
    : urgentTeamFirst(draftTeams.map(team => ({ ...team, accepted: countsByTeam[team.id]?.accepted ?? 0, pending: countsByTeam[team.id]?.pending ?? 0 })))[0]?.id
  const hub = teamHub({
    coachTeams: teams?.length ?? 0,
    pendingTeamInvites: pendingInvites.length,
    pendingStaffInvites: pendingStaff.length,
    pendingSkillProposals: skillProposals.length,
    pendingAttestations: attestations.filter(row => row.status === 'pending').length,
    unansweredEvents: myEvents.filter(row => row.answer === null).length,
    events: myEvents.length,
    plans: myPlans.length,
    news: myNews.length,
    notes: coachNotes.length,
    minutes: myMinutes.length,
    staff: myTeamStaff.length,
    acceptedStaffTeams: acceptedStaff.length,
    memberships: acceptedInvites.length + myEntries.length + childTeams.length,
    canCreateTeam,
  })
  const loadFailed = Boolean(teamsError || invitesError)
  const h = await getTranslations('teamHub')
  const head = (id: TeamHubSection, icon: ReactNode, extra?: ReactNode) => <div className="tm-section-head">
    <h2 id={`tm-${id}-title`}>{icon}{h(`sections.${id}`)}</h2>{extra}
  </div>

  return <main className="bds-page tm-page gl gl-scene" style={glassSceneStyle(PAGE_PHOTOS.teams)}>
    <PageHeader back={{ href: '/profile', label: h('back') }} />
    <section className="tm-head">
      <div className="tm-hero">
        <h1 className="ui-h1">{t('title')}</h1>
        <p className="tm-lead">{hub.isCoach ? h('leadCoach') : h('leadFamily')}</p>
        {hub.todo > 0 && <a className="tm-todo-pill" href={hub.sections.includes('todo') ? '#tm-todo' : '#tm-week'}><BellRing size={16} aria-hidden="true" />{h('todo', { count: hub.todo })}</a>}
        {hub.sections.length > 1 && <nav className="tm-jump" aria-label={h('jumpLabel')}>
          {hub.sections.map(id => <a key={id} href={`#tm-${id}`}>{h(`sections.${id}`)}</a>)}
        </nav>}
      </div>
    </section>
    <div className="tm-wrap">

      {loadFailed && <p role="alert" className="tp-alert">{t('loadFailed')}</p>}
      {attestationError && <p role="alert" className="tp-alert">{h('attestationsFailed')}</p>}

      {hub.sections.includes('todo') && <section id="tm-todo" className="tm-section is-todo" aria-labelledby="tm-todo-title">
        {head('todo', <BellRing size={18} aria-hidden="true" />, <span className="tm-count">{hub.waiting}</span>)}
        {pendingInvites.length > 0 && <TeamMembersClient teams={[]} invites={pendingInvites as never[]} counts={null} />}
        <StaffInvitesPanel rows={pendingStaff} />
        {!attestationError && <AthleteAttestationInbox attestations={attestations} />}
        <AthleteSkillInbox proposals={skillProposals} />
      </section>}

      {hub.sections.includes('teams') && <section id="tm-teams" className="tm-section" aria-labelledby="tm-teams-title">
        {head('teams', <ShieldHalf size={18} aria-hidden="true" />, teams?.length ? <Link href="/match-plan" className="tm-head-link"><ClipboardPenLine size={15} aria-hidden="true" />{h('matchPlan')}</Link> : null)}
        {/* A team in draft is mid-registration: inviting is the step the coach is on (UX mockup v3-A). */}
        {draftTeams.length > 0 && <div className="ui-card tm-invite"><TeamMembersClient teams={draftTeams} firstTeam={firstTeam} invites={[]} counts={rosterError ? null : countsByTeam} myName={myName} /></div>}
        {canCreateTeam && <CreateTeamForm />}
        <CoachTeamOverview statsLabel={h('openTeam')} myTeamLabel={h('myTeam')} canKeep={ownTeamsReady} teams={overview} rosterError={Boolean(rosterError)} attestations={attestationState} attestationError={Boolean(coachAttestationError)} />
        <StaffInvitesPanel rows={acceptedStaff} />
      </section>}

      {hub.sections.includes('mine') && <section id="tm-mine" className="tm-section" aria-labelledby="tm-mine-title">
        {head('mine', <Users size={18} aria-hidden="true" />)}
        {acceptedInvites.length > 0 && <ul className="ui-card tm-mine">
          {acceptedInvites.map(row => {
            const team = (row as unknown as MyTeamMembership).teams
            return <li key={row.id}><b>{team?.name || h('yourTeam')}</b><span>{h('joined')}</span>
              {team?.kind === 'club' && <LeaveTeamButton memberId={row.id} teamName={team.name} />}</li>
          })}
        </ul>}
        {childTeams.length > 0 && <ul className="ui-card tm-mine" aria-label={h('childTeams')}>
          {childTeams.map(row => <li key={row.member_id}><b>{row.team_name}</b><span className="tm-child">{row.athlete_name?.trim() || h('yourChild')}</span>
            <LeaveTeamButton memberId={row.member_id} teamName={row.team_name} childName={row.athlete_name?.trim() || h('yourChild')} /></li>)}
        </ul>}
        <MyEntriesPanel rows={myEntries} viewerId={user.id} />
      </section>}

      {hub.sections.includes('week') && <section id="tm-week" className="tm-section" aria-labelledby="tm-week-title">
        {head('week', <CalendarDays size={18} aria-hidden="true" />)}
        <MyEventsPanel rows={myEvents} viewerId={user.id} />
        <MyTrainingPanel rows={myPlans} thisWeek={planDay.thisWeek} today={planDay.today} />
      </section>}

      {hub.sections.includes('news') && <section id="tm-news" className="tm-section" aria-labelledby="tm-news-title">
        {head('news', <Megaphone size={18} aria-hidden="true" />)}
        <MyNewsPanel rows={myNews} />
        <MyCoachNotesPanel rows={coachNotes} viewerId={user.id} />
      </section>}

      {hub.sections.includes('season') && <section id="tm-season" className="tm-section" aria-labelledby="tm-season-title">
        {head('season', <Timer size={18} aria-hidden="true" />)}
        <MyMinutesPanel rows={myMinutes} viewerId={user.id} />
        <MyTeamStaffPanel rows={myTeamStaff} />
      </section>}

      {!loadFailed && hub.empty && <NoTeamYet />}
    </div>
  </main>
}
