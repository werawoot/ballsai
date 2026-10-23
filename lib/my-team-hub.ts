import type { SupabaseClient } from '@supabase/supabase-js'
import { MY_TEAM_MEMBERSHIPS_LIMIT, fetchMyTeamMemberships, membershipFromRow, type MembershipRow, type MyTeamMembership } from './my-team-memberships'
import type { EntryRosterRow } from './own-team'
import type { ChildTeamRow } from './team-join'
import type { MyStaffTeamRow, MyTeamStaffRow } from './team-staff'
import type { MyEventRow } from '@/app/team-members/MyEventsPanel'
import type { MyAnnouncementRow } from '@/app/team-members/MyNewsPanel'
import type { MyPlanRow } from '@/app/team-members/MyTrainingPanel'
import type { MyNoteRow } from '@/app/team-members/MyCoachNotesPanel'
import type { MyMinutesRow } from '@/app/team-members/MyMinutesPanel'

// What /team-members shows of the person's own teams (T59): their memberships and
// invitations, the tournaments they or a child were entered in, events, news, plans, coach
// notes, minutes and staff. my_team_hub (sql/92) returns all of it in one call; before that
// file is applied the ten functions it wraps are called side by side, as the page used to
// call them one after another. A section whose function is missing (older SQL) is empty.

export type MyTeamHub = {
  memberships: MyTeamMembership[]
  entries: EntryRosterRow[]
  events: MyEventRow[]
  childTeams: ChildTeamRow[]
  news: MyAnnouncementRow[]
  plans: MyPlanRow[]
  notes: MyNoteRow[]
  minutes: MyMinutesRow[]
  staffTeams: MyStaffTeamRow[]
  teamStaff: MyTeamStaffRow[]
  // The memberships could not be read: the page says so instead of showing no teams.
  failed: boolean
}

type HubJson = {
  memberships?: MembershipRow[]; entries?: EntryRosterRow[]; events?: MyEventRow[]; child_teams?: ChildTeamRow[]
  news?: MyAnnouncementRow[]; plans?: MyPlanRow[]; notes?: MyNoteRow[]; minutes?: MyMinutesRow[]
  staff_teams?: MyStaffTeamRow[]; team_staff?: MyTeamStaffRow[]
}

const MISSING = ['PGRST202', '42883']
const EMPTY: MyTeamHub = { memberships: [], entries: [], events: [], childTeams: [], news: [], plans: [], notes: [], minutes: [], staffTeams: [], teamStaff: [], failed: false }

export async function fetchMyTeamHub(client: SupabaseClient, userId: string): Promise<MyTeamHub> {
  const { data, error } = await client.rpc('my_team_hub')
  if (!error) {
    const hub = (data ?? {}) as HubJson
    return {
      memberships: (hub.memberships ?? []).map(membershipFromRow),
      entries: hub.entries ?? [],
      events: hub.events ?? [],
      childTeams: hub.child_teams ?? [],
      news: hub.news ?? [],
      plans: hub.plans ?? [],
      notes: hub.notes ?? [],
      minutes: hub.minutes ?? [],
      staffTeams: hub.staff_teams ?? [],
      teamStaff: hub.team_staff ?? [],
      failed: false,
    }
  }
  if (!MISSING.includes(error.code ?? '')) {
    console.error(JSON.stringify({ level: 'error', event: 'my_team_hub_failed', code: error.code ?? null }))
    return { ...EMPTY, failed: true }
  }
  return fetchMyTeamHubSeparately(client, userId)
}

// Before sql/92. Delete once SQL92 is on Production.
async function fetchMyTeamHubSeparately(client: SupabaseClient, userId: string): Promise<MyTeamHub> {
  const list = async <T>(call: PromiseLike<{ data: unknown; error: unknown }>) => {
    const { data, error } = await call
    return error ? [] : ((data ?? []) as T[])
  }
  const [{ memberships, failed }, entries, events, childTeams, news, plans, notes, minutes, staffTeams, teamStaff] = await Promise.all([
    fetchMyTeamMemberships(client as never, userId, MY_TEAM_MEMBERSHIPS_LIMIT),
    list<EntryRosterRow>(client.rpc('my_entry_rosters', { p_limit: 50 })),
    list<MyEventRow>(client.rpc('my_upcoming_team_events', { p_limit: 30 })),
    list<ChildTeamRow>(client.rpc('my_children_team_memberships')),
    list<MyAnnouncementRow>(client.rpc('my_team_announcements', { p_limit: 10 })),
    list<MyPlanRow>(client.rpc('my_team_training_plans')),
    list<MyNoteRow>(client.rpc('my_coach_notes', { p_limit: 50 })),
    list<MyMinutesRow>(client.rpc('my_match_minutes')),
    list<MyStaffTeamRow>(client.rpc('my_staff_teams')),
    list<MyTeamStaffRow>(client.rpc('my_team_staff')),
  ])
  return { memberships, entries, events, childTeams, news, plans, notes, minutes, staffTeams, teamStaff, failed }
}
