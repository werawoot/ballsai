import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import TeamMembersClient from './TeamMembersClient'
import NoTeamYet from './NoTeamYet'
import CoachTeamOverview from './CoachTeamOverview'
import AthleteAttestationInbox from './AthleteAttestationInbox'
import AthleteSkillInbox, { type SkillProposal } from './AthleteSkillInbox'
import MyEventsPanel from './MyEventsPanel'
import MyNewsPanel from './MyNewsPanel'
import MyTrainingPanel from './MyTrainingPanel'
import MyCoachNotesPanel from './MyCoachNotesPanel'
import MyMinutesPanel from './MyMinutesPanel'
import StaffInvitesPanel from './StaffInvitesPanel'
import MyTeamStaffPanel from './MyTeamStaffPanel'
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
import { teamNamesById, type MyTeamMembership } from '@/lib/my-team-memberships'
import { fetchMyTeamHub } from '@/lib/my-team-hub'
import LeaveTeamButton from './LeaveTeamButton'
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
  // Everything that needs only the user id, side by side (T59): the coach's teams, the
  // person's own team data (one call to my_team_hub, sql/92, or its ten functions before it
  // is applied), their profile, and what coaches sent them to answer.
  const [teamsFirst, mine, { data: profileRow }, { data: attestationRows, error: attestationError }, { data: skillRows }] = await Promise.all([
    teamsQuery('id, name, tournament_id, status, kind, tournaments(name, fee)'),
    fetchMyTeamHub(supabase, user.id),
    supabase.from('profiles').select('role, onboarding_persona, full_name').eq('id', user.id).maybeSingle(),
    // The athlete's own pending and answered attestations. A failure here is surfaced
    // too, rather than silently hiding a request that is waiting on them.
    // No join from coach_id: PostgREST needs a proven, RLS-safe relationship for that,
    // and a coach's name, email or phone is not the athlete's to read. The team is the
    // identifier the athlete already knows, because they accepted its invitation.
    supabase.from('coach_attestations')
      .select('id, team_id, field, claimed_value, status, created_at, teams(name)')
      .eq('athlete_id', user.id)
      .order('created_at', { ascending: false }),
    // Skill ratings a coach sent this athlete (sql/69), waiting on them. Before SQL69 the
    // table is missing: there is nothing to answer, so nothing is shown.
    supabase.from('coach_skill_assessments')
      .select('id, team_id, created_at, speed, stamina, strength, technique, vision, teams(name)')
      .eq('athlete_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  const invites = mine.memberships
  const invitesError = mine.failed
  const ownTeamsReady = !teamsFirst.error
  const { data: teamsData, error: teamsError } = ownTeamsReady ? teamsFirst : await teamsQuery('id, name, tournament_id, status, tournaments(name, fee)')
  const teams = teamsData as unknown as { id: string; name: string; tournament_id: string; status: string; kind?: 'club' | 'entry'; tournaments: { name: string | null; fee?: number | null } | null }[] | null
  const myEntries = mine.entries
  const persona = (profileRow as { role?: string; onboarding_persona?: string; full_name?: string | null } | null)
  // The name families see in a team's staff list (sql/76); asked for before the first invite.
  const myName = profileRow ? (persona?.full_name?.trim() || null) : undefined
  // Who may create an own team (sql/78, D3): a coach persona, or an organizer or admin.
  const canCreateTeam = ownTeamsReady && (persona?.onboarding_persona === 'coach_organizer' || persona?.role === 'organizer' || persona?.role === 'admin')
  // The roster of the teams this account created, which is a different question from
  // the invitations this account received. RLS scopes both; the team ids are only ever
  // the ones the query above already returned.
  const teamIds = (teams ?? []).map(team => team.id)
  const [{ data: rosterRows, error: rosterError }, { data: coachAttestationRows, error: coachAttestationError }] = teamIds.length
    ? await Promise.all([
      supabase.from('team_members')
        .select('id, team_id, athlete_id, status, invited_at')
        .in('team_id', teamIds)
        .order('invited_at', { ascending: true }),
      // The coach's own view: the newest attestation state for each of their members, so
      // the form can refuse a duplicate before it is posted.
      supabase.from('coach_attestations')
        .select('id, team_id, athlete_id, field, claimed_value, status, created_at')
        .in('team_id', teamIds)
        .order('created_at', { ascending: true }),
    ])
    : [{ data: [], error: null }, { data: [], error: null }]
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

  // The coach's id is not joined, and the team row is the coach's: the name comes from the
  // athlete's own memberships (sql/82).
  const myTeamNames = teamNamesById(invites)
  const attestations = (attestationRows ?? []).map(row => ({
    id: row.id as string,
    teamName: (row.teams as { name?: string } | null)?.name ?? myTeamNames.get(row.team_id as string) ?? '',
    field: 'playing_position',
    claimedValue: row.claimed_value,
    status: row.status,
    createdAt: row.created_at,
  })) as unknown as AthleteAttestation[]

  const skillProposals: SkillProposal[] = ((skillRows ?? []) as unknown as (Record<string, unknown> & { id: string; team_id: string; created_at: string; teams: { name?: string } | null })[]).map(row => ({
    id: row.id,
    createdAt: row.created_at,
    teamName: row.teams?.name ?? myTeamNames.get(row.team_id) ?? '',
    skills: Object.fromEntries(COACH_SKILL_KEYS.map(key => [key, (row[key] as number | null) ?? null])) as CoachSkills,
  }))
  // Upcoming events (sql/70), a guardian's children's teams (sql/83), news (sql/71), plans
  // (sql/72), coach notes (sql/73), minutes (sql/74) and staff (sql/75), all from the
  // my_team_hub read above; a section whose SQL is not applied is empty.
  const myEvents = mine.events
  const childTeams = mine.childTeams
  const myNews = mine.news
  const myPlans = mine.plans
  const planDay = planToday()
  const coachNotes = mine.notes
  const myMinutes = mine.minutes
  const myStaffTeams = mine.staffTeams
  const myTeamStaff = mine.teamStaff
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
