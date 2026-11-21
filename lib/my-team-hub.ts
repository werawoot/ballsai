import type { SupabaseClient } from '@supabase/supabase-js'
import { membershipFromRow, type MembershipRow, type MyTeamMembership } from './my-team-memberships'
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
// notes, minutes and staff. my_team_hub (sql/92, on Staging and Production since 23 Oct 2026)
// returns all of it in one call. If the call fails, the page says so instead of showing no teams.

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

const EMPTY: MyTeamHub = { memberships: [], entries: [], events: [], childTeams: [], news: [], plans: [], notes: [], minutes: [], staffTeams: [], teamStaff: [], failed: false }

export async function fetchMyTeamHub(client: SupabaseClient): Promise<MyTeamHub> {
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
  console.error(JSON.stringify({ level: 'error', event: 'my_team_hub_failed', code: error.code ?? null }))
  return { ...EMPTY, failed: true }
}
