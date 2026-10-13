// What "ของฉัน" (/profile) opens on for each kind of person (UX report 9). Kept free of React
// and of the database so every rule here can be tested directly: the page reads the facts,
// this module decides which home and which single primary action.
//
// Two columns decide, and they are not the same thing: `profiles.onboarding_persona` is what
// the person chose in /welcome, `profiles.role` is what an admin granted by hand. The coach
// and the organizer are one choice in /welcome (`coach_organizer`); only the granted role says
// organizer, so a coach is never sent to the organizer dashboard.

export type HomeKind = 'athlete' | 'guardian' | 'coach' | 'organizer' | 'venue' | 'sponsor'

const organizes = (role: string | null | undefined) => role === 'organizer' || role === 'admin'

export function homeKind({ persona, role }: { persona: string | null | undefined; role: string | null | undefined }): HomeKind {
  if (persona === 'guardian') return 'guardian'
  if (persona === 'venue_owner') return 'venue'
  if (persona === 'sponsor_brand') return 'sponsor'
  if (persona === 'coach_organizer') return organizes(role) ? 'organizer' : 'coach'
  if (!persona && organizes(role)) return 'organizer'
  return 'athlete'
}

export type HomeAction = { key: string; href: string; count?: number }
// tools: things this person can use straight away, alone (AGENTS.md product rule);
// next: the step that needs someone else (an invitation, a tournament), shown last.
export type RoleHome = { primary: HomeAction; rows: HomeAction[]; tools?: HomeAction[]; next?: HomeAction }

// A line of numbers under the primary action's title (guardian: linked / waiting; coach: newest team).
export type RoleStats = { key: 'guardian' | 'coach'; values: Record<string, string | number> }

export type CoachTeam = { id: string; name: string; status: string; accepted: number; pending: number }
export type HomeFacts = {
  guardian: { accepted: number; pending: number }
  // Newest first. Only the newest team decides the primary action.
  // ownTeams: SQL78 is in, so a coach can create their own team without a tournament.
  coach: { teams: CoachTeam[]; ownTeams?: boolean }
  organizer: { tournaments: number; pendingTeams: number }
  venue: { venues: number; pendingRequests: number }
  sponsor: Record<string, never>
}

const action = (key: string, href: string, count?: number): HomeAction => count === undefined ? { key, href } : { key, href, count }
const without = (rows: HomeAction[], primary: HomeAction) => rows.filter(row => row.key !== primary.key).slice(0, 3)

// A guardian can use the site before any child is linked (report 10, mockup v10-4): the
// programmes by age, the drill library, tournaments, the hall of fame and how children's data
// is kept. Linking a child needs the child's answer, so it is the step after, never a wall.
const GUARDIAN_TOOLS = [action('findTournament', '/tournaments'), action('drills', '/training/drills'), action('hallOfFame', '/hall-of-fame'), action('privacy', '/privacy')]

function guardianHome({ accepted, pending }: HomeFacts['guardian']): RoleHome {
  if (accepted > 0) return { primary: action('viewChildren', '/guardian'), rows: [], tools: GUARDIAN_TOOLS }
  const next = pending > 0 ? action('waitingChild', '/guardian') : action('linkChild', '/guardian')
  return { primary: action('guardianProgrammes', '/training'), rows: [], tools: GUARDIAN_TOOLS, next }
}

// A coach can work at once, with no team and no invitation (report 10, mockup v10-1): the
// match board has a draft mode kept on this device, and the drill library, the programmes and
// the athlete search need nobody. Registering a team for a tournament, and inviting athletes
// into it, is the step after.
const COACH_TOOLS = [action('drills', '/training/drills'), action('programmes', '/training'), action('findAthletes', '/athletes'), action('findTournament', '/tournaments')]

function coachHome({ teams, ownTeams = false }: HomeFacts['coach']): RoleHome {
  const newest = teams[0]
  // With SQL78 a coach's first step is their own team (docs/coach-own-team-v1.md); entering
  // a tournament is done from that team later. Before it, the draft board, as before.
  if (!newest && ownTeams) return { primary: action('createTeam', '/team-members#create'), rows: [], tools: [action('draftBoard', '/match-plan'), ...COACH_TOOLS.slice(0, 2), COACH_TOOLS[3]] }
  if (!newest) return { primary: action('draftBoard', '/match-plan'), rows: [], tools: COACH_TOOLS, next: action('registerTeam', '/tournaments') }
  const primary = newest.status !== 'draft' ? action('teamStatus', '/team-members')
    : newest.accepted > 0 ? action('submitTeam', '/team-members') : action('inviteAthletes', '/team-members')
  const rows = [action('inviteAthletes', '/team-members'), action('matchPlan', '/match-plan'), action('findTournament', '/tournaments')]
  return { primary, rows: without(rows, primary), tools: COACH_TOOLS.filter(tool => tool.key !== 'findTournament') }
}

function organizerHome({ tournaments, pendingTeams }: HomeFacts['organizer']): RoleHome {
  const primary = pendingTeams > 0 ? action('reviewTeams', '/dashboard', pendingTeams)
    : tournaments > 0 ? action('recordResults', '/dashboard/results') : action('createTournament', '/dashboard/create')
  const rows = [
    action('createTournament', '/dashboard/create'),
    ...(tournaments > 0 ? [action('recordResults', '/dashboard/results'), action('myTournaments', '/dashboard')] : []),
    action('myTeams', '/team-members'),
  ]
  return { primary, rows: without(rows, primary) }
}

function venueHome({ venues, pendingRequests }: HomeFacts['venue']): RoleHome {
  const primary = pendingRequests > 0 ? action('answerRequests', '/venue', pendingRequests)
    : venues === 0 ? action('addVenue', '/venue') : action('openSlots', '/venue')
  // /venues/bookings is the requester's own list, not the owner's inbox, so it is not offered here.
  const rows = venues > 0 ? [action('openSlots', '/venue'), action('allVenues', '/venues')] : [action('allVenues', '/venues')]
  return { primary, rows: without(rows, primary) }
}

function sponsorHome(): RoleHome {
  const primary = action('sponsorHome', '/sponsor')
  return { primary, rows: without([action('opportunities', '/sponsorships'), action('findAthletes', '/athletes')], primary) }
}

export function roleHome<K extends Exclude<HomeKind, 'athlete'>>(kind: K, facts: HomeFacts[K]): RoleHome {
  switch (kind) {
    case 'guardian': return guardianHome(facts as HomeFacts['guardian'])
    case 'coach': return coachHome(facts as HomeFacts['coach'])
    case 'organizer': return organizerHome(facts as HomeFacts['organizer'])
    case 'venue': return venueHome(facts as HomeFacts['venue'])
    default: return sponsorHome()
  }
}
