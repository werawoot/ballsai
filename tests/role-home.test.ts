import { describe, expect, it } from 'vitest'
import { homeKind, roleHome } from '@/lib/role-home'

// UX report 9: "ของฉัน" opens on the person's own work and shows one primary button.
// profiles.onboarding_persona is what the person chose in /welcome; profiles.role is what an
// admin granted. They are not the same thing, so the page needs both to decide.

describe('which home a person gets', () => {
  it.each([
    [{ persona: 'athlete', role: 'user' }, 'athlete'],
    [{ persona: null, role: 'user' }, 'athlete'],
    [{ persona: 'athlete', role: 'player' }, 'athlete'],
    [{ persona: 'guardian', role: 'user' }, 'guardian'],
    [{ persona: 'venue_owner', role: 'user' }, 'venue'],
    [{ persona: 'sponsor_brand', role: 'user' }, 'sponsor'],
    // The coach and organizer are one choice in /welcome; only the granted role says organizer.
    [{ persona: 'coach_organizer', role: 'user' }, 'coach'],
    [{ persona: 'coach_organizer', role: 'organizer' }, 'organizer'],
    [{ persona: 'coach_organizer', role: 'admin' }, 'organizer'],
    [{ persona: null, role: 'organizer' }, 'organizer'],
  ] as const)('%j opens the %s home', (input, kind) => {
    expect(homeKind(input)).toBe(kind)
  })

  it('does not take a chosen role away because an account is also an organizer', () => {
    expect(homeKind({ persona: 'guardian', role: 'organizer' })).toBe('guardian')
    expect(homeKind({ persona: 'venue_owner', role: 'admin' })).toBe('venue')
  })
})

describe('guardian: ลูกของฉัน', () => {
  // AGENTS.md product rule (report 10, mockup v10-4): something to use at once, linking last.
  it('starts with the programmes by age when no child is linked, and asks to link last', () => {
    const home = roleHome('guardian', { accepted: 0, pending: 0 })
    expect(home.primary).toEqual({ key: 'guardianProgrammes', href: '/training' })
    expect(home.tools?.map(tool => tool.href)).toEqual(['/tournaments', '/training/drills', '/hall-of-fame', '/privacy'])
    expect(home.next).toEqual({ key: 'linkChild', href: '/guardian' })
  })
  it('keeps the waiting request as the next step, not a wall', () => {
    const home = roleHome('guardian', { accepted: 0, pending: 1 })
    expect(home.primary.key).toBe('guardianProgrammes')
    expect(home.next).toEqual({ key: 'waitingChild', href: '/guardian' })
  })
  it('opens the linked child first', () => {
    const home = roleHome('guardian', { accepted: 2, pending: 1 })
    expect(home.primary).toEqual({ key: 'viewChildren', href: '/guardian' })
    expect(home.tools?.length).toBe(4)
    expect(home.next).toBeUndefined()
  })
})

describe('coach: ทีมของฉัน', () => {
  const team = (status: string, accepted: number, pending = 0) => ({ id: 't', name: 'Lions', status, accepted, pending })
  it('starts with something to use at once when there is no team, and leaves registering for last', () => {
    const home = roleHome('coach', { teams: [] })
    // The match board has a draft mode on this device: no team, no invitation needed (report 10).
    expect(home.primary).toEqual({ key: 'draftBoard', href: '/match-plan' })
    expect(home.tools?.map(tool => tool.href)).toEqual(['/training/drills', '/training', '/athletes', '/tournaments'])
    expect(home.next).toEqual({ key: 'registerTeam', href: '/tournaments' })
  })
  it('keeps the tools once there is a team, without repeating a shortcut', () => {
    const home = roleHome('coach', { teams: [team('draft', 0, 2)] })
    const tools = (home.tools ?? []).map(tool => tool.key)
    expect(tools).toEqual(['drills', 'programmes', 'findAthletes'])
    expect(home.rows.map(row => row.key).some(key => tools.includes(key))).toBe(false)
    expect(home.next).toBeUndefined()
  })
  it('invites athletes while nobody has accepted', () => {
    expect(roleHome('coach', { teams: [team('draft', 0, 2)] }).primary).toEqual({ key: 'inviteAthletes', href: '/team-members' })
  })
  it('submits as soon as one athlete accepted, without waiting for the rest', () => {
    expect(roleHome('coach', { teams: [team('draft', 1, 4)] }).primary).toEqual({ key: 'submitTeam', href: '/team-members' })
  })
  it('shows the team status once submitted', () => {
    expect(roleHome('coach', { teams: [team('pending', 3)] }).primary).toEqual({ key: 'teamStatus', href: '/team-members' })
    expect(roleHome('coach', { teams: [team('confirmed', 3)] }).primary).toEqual({ key: 'teamStatus', href: '/team-members' })
  })
  it('works from the newest team', () => {
    expect(roleHome('coach', { teams: [team('draft', 2), team('confirmed', 5)] }).primary.key).toBe('submitTeam')
  })
  it('never points a coach at the organizer dashboard', () => {
    const none = roleHome('coach', { teams: [] })
    const some = roleHome('coach', { teams: [team('draft', 0)] })
    for (const home of [none, some]) {
      expect([home.primary.href, ...home.rows.map(row => row.href), ...(home.tools ?? []).map(tool => tool.href), home.next?.href ?? ''].some(href => href.startsWith('/dashboard'))).toBe(false)
    }
  })
})

describe('organizer: รายการของฉัน', () => {
  it('reviews waiting teams first and says how many', () => {
    expect(roleHome('organizer', { tournaments: 2, pendingTeams: 3 }).primary).toEqual({ key: 'reviewTeams', href: '/dashboard', count: 3 })
  })
  it('records results when no team waits', () => {
    expect(roleHome('organizer', { tournaments: 2, pendingTeams: 0 }).primary).toEqual({ key: 'recordResults', href: '/dashboard/results' })
  })
  it('creates the first tournament when there is none', () => {
    expect(roleHome('organizer', { tournaments: 0, pendingTeams: 0 }).primary).toEqual({ key: 'createTournament', href: '/dashboard/create' })
  })
})

describe('venue owner: สนามของฉัน', () => {
  it('answers waiting booking requests first', () => {
    expect(roleHome('venue', { venues: 1, pendingRequests: 2 }).primary).toEqual({ key: 'answerRequests', href: '/venue', count: 2 })
  })
  it('adds the first venue when there is none', () => {
    expect(roleHome('venue', { venues: 0, pendingRequests: 0 }).primary).toEqual({ key: 'addVenue', href: '/venue' })
  })
  it('otherwise offers more free time', () => {
    expect(roleHome('venue', { venues: 1, pendingRequests: 0 }).primary).toEqual({ key: 'openSlots', href: '/venue' })
  })
})

describe('every home', () => {
  const homes = [
    roleHome('guardian', { accepted: 1, pending: 1 }),
    roleHome('coach', { teams: [{ id: 't', name: 'A', status: 'draft', accepted: 1, pending: 0 }] }),
    roleHome('organizer', { tournaments: 3, pendingTeams: 1 }),
    roleHome('venue', { venues: 2, pendingRequests: 1 }),
    roleHome('sponsor', {}),
  ]
  it('has at most three shortcuts under the one primary action', () => {
    for (const home of homes) expect(home.rows.length).toBeLessThanOrEqual(3)
  })
  it('does not list the primary action again as a shortcut', () => {
    for (const home of homes) expect(home.rows.map(row => row.key)).not.toContain(home.primary.key)
  })
})
