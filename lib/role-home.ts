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
export type RoleHome = { primary: HomeAction; rows: HomeAction[] }

// A line of numbers under the primary action's title (guardian: linked / waiting; coach: newest team).
export type RoleStats = { key: 'guardian' | 'coach'; values: Record<string, string | number> }

export type CoachTeam = { id: string; name: string; status: string; accepted: number; pending: number }
export type HomeFacts = {
  guardian: { accepted: number; pending: number }
  // Newest first. Only the newest team decides the primary action.
  coach: { teams: CoachTeam[] }
  organizer: { tournaments: number; pendingTeams: number }
  venue: { venues: number; pendingRequests: number }
  sponsor: Record<string, never>
}

const action = (key: string, href: string, count?: number): HomeAction => count === undefined ? { key, href } : { key, href, count }
const without = (rows: HomeAction[], primary: HomeAction) => rows.filter(row => row.key !== primary.key).slice(0, 3)

function guardianHome({ accepted, pending }: HomeFacts['guardian']): RoleHome {
  const primary = accepted > 0 ? action('viewChildren', '/guardian') : pending > 0 ? action('waitingChild', '/guardian') : action('linkChild', '/guardian')
  return { primary, rows: without([action('findTournament', '/tournaments'), action('findAthletes', '/athletes')], primary) }
}

function coachHome({ teams }: HomeFacts['coach']): RoleHome {
  const newest = teams[0]
  const primary = !newest ? action('registerTeam', '/tournaments')
    : newest.status !== 'draft' ? action('teamStatus', '/team-members')
      : newest.accepted > 0 ? action('submitTeam', '/team-members') : action('inviteAthletes', '/team-members')
  const rows = newest
    ? [action('inviteAthletes', '/team-members'), action('matchPlan', '/match-plan'), action('findTournament', '/tournaments')]
    : [action('findAthletes', '/athletes')]
  return { primary, rows: without(rows, primary) }
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
