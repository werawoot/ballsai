import { describe, expect, it } from 'vitest'
import { teamHub, type TeamHubInput } from '@/lib/team-hub'

const none: TeamHubInput = {
  coachTeams: 0, pendingTeamInvites: 0, pendingStaffInvites: 0, pendingSkillProposals: 0, pendingAttestations: 0,
  unansweredEvents: 0, events: 0, plans: 0, news: 0, notes: 0, minutes: 0, staff: 0, acceptedStaffTeams: 0, memberships: 0,
}

describe('/team-members hub', () => {
  it('is the "no team yet" start only when there is nothing at all', () => {
    expect(teamHub(none)).toEqual({ waiting: 0, todo: 0, sections: [], isCoach: false, empty: true })
  })

  it('leads with what waits on the person, then the sections that have something, in order', () => {
    const hub = teamHub({ ...none, pendingTeamInvites: 1, pendingSkillProposals: 1, unansweredEvents: 2, events: 2, news: 1, minutes: 1, memberships: 1 })
    expect([hub.waiting, hub.todo]).toEqual([2, 4])
    expect(hub.sections).toEqual(['todo', 'mine', 'week', 'news', 'season'])
    expect(hub.empty).toBe(false)
  })

  it('counts an unanswered event as waiting but keeps it in this week, not in the to-do list', () => {
    const hub = teamHub({ ...none, unansweredEvents: 1, events: 1 })
    expect(hub.todo).toBe(1)
    expect(hub.sections).toEqual(['week'])
  })

  it('gives a guardian with no team of their own their child\'s team, not the empty start', () => {
    const hub = teamHub({ ...none, news: 2, staff: 2 })
    expect(hub.empty).toBe(false)
    expect(hub.sections).toEqual(['news', 'season'])
  })

  it('shows the coach section to a head coach and to an accepted assistant', () => {
    expect(teamHub({ ...none, coachTeams: 1 }).sections).toEqual(['teams'])
    expect(teamHub({ ...none, acceptedStaffTeams: 1 }).isCoach).toBe(true)
    expect(teamHub({ ...none, pendingStaffInvites: 1 }).isCoach).toBe(false)
  })
})
