// /team-members is one page for every role: a coach's teams, an assistant's invitations,
// an athlete's and a guardian's news from the team. This decides what the page leads with:
// the things waiting on this person (one count), then only the sections that have
// something in them, in the order a person acts on them. The words live in
// messages/*.json (teamHub.*).

export type TeamHubSection = 'todo' | 'teams' | 'mine' | 'week' | 'news' | 'season'

export type TeamHubInput = {
  coachTeams: number
  pendingTeamInvites: number
  pendingStaffInvites: number
  pendingSkillProposals: number
  pendingAttestations: number
  unansweredEvents: number
  events: number
  plans: number
  news: number
  notes: number
  minutes: number
  staff: number
  acceptedStaffTeams: number
  memberships: number
}

export type TeamHub = {
  // Answers waiting on this person outside "this week" (invitations, ratings, positions).
  waiting: number
  todo: number
  sections: TeamHubSection[]
  isCoach: boolean
  // Nothing to show at all: the "no team yet" start.
  empty: boolean
}

export function teamHub(input: TeamHubInput): TeamHub {
  // An event without an answer is waiting on this person too; it stays in "this week".
  const waiting = input.pendingTeamInvites + input.pendingStaffInvites + input.pendingSkillProposals + input.pendingAttestations
  const todo = waiting + input.unansweredEvents
  const isCoach = input.coachTeams > 0 || input.acceptedStaffTeams > 0
  const sections: TeamHubSection[] = []
  if (waiting > 0) sections.push('todo')
  if (isCoach) sections.push('teams')
  // The teams this account plays in (accepted invitations).
  if (input.memberships > 0) sections.push('mine')
  if (input.events + input.plans > 0) sections.push('week')
  if (input.news + input.notes > 0) sections.push('news')
  if (input.minutes + input.staff > 0) sections.push('season')
  // A guardian has no team_members row of their own, so their child's events and news
  // count as having a team.
  const empty = sections.length === 0 && input.unansweredEvents === 0
  return { waiting, todo, sections, isCoach, empty }
}
