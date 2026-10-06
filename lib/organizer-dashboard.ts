import type { SupabaseClient } from '@supabase/supabase-js'

// /dashboard shows an organizer's own tournaments and the teams waiting for approval.
// Both are read one page at a time and every request names at most one page of ids, so
// the page costs the same for an organizer with three tournaments as for one with three
// hundred. The totals at the top are database counts, not rows loaded to be counted.
export const DASHBOARD_PAGE_SIZE = 10

export type DashboardTournament = Record<string, unknown> & {
  id: string
  name: string
  location: string | null
  start_date: string
  fee: number
  status: string
}
export type DashboardPendingTeam = Record<string, unknown> & {
  id: string
  name: string
  members: string | null
  tournament_id: string
  tournaments: { name: string; fee?: number | null } | null
}
export type DashboardPayment = Record<string, unknown> & { id: string; team_id: string; amount: number | null; status: string; slip_url: string | null }

type Options = { organizerId: string; tournamentsPage: number; pendingPage: number }

const range = (page: number) => [(page - 1) * DASHBOARD_PAGE_SIZE, page * DASHBOARD_PAGE_SIZE] as const

export async function fetchOrganizerDashboard(client: SupabaseClient, { organizerId, tournamentsPage, pendingPage }: Options) {
  // Teams are the organizer's through their tournament; the inner join filters in the
  // database instead of shipping a list of every tournament id.
  const organizerTeams = (columns: string, options?: { count: 'exact'; head: true }) =>
    client.from('teams').select(`${columns}, tournaments!inner(name, organizer_id, fee)`, options).eq('tournaments.organizer_id', organizerId)

  const [tournamentCount, pendingCount, confirmedCount, tournamentRows, pendingRows] = await Promise.all([
    client.from('tournaments').select('id', { count: 'exact', head: true }).eq('organizer_id', organizerId),
    organizerTeams('id', { count: 'exact', head: true }).eq('status', 'pending'),
    organizerTeams('id', { count: 'exact', head: true }).eq('status', 'confirmed'),
    client.from('tournaments').select('*').eq('organizer_id', organizerId)
      .order('created_at', { ascending: false }).order('id', { ascending: true })
      .range(...range(tournamentsPage)),
    organizerTeams('*').eq('status', 'pending')
      .order('created_at', { ascending: false }).order('id', { ascending: true })
      .range(...range(pendingPage)),
  ])
  for (const result of [tournamentCount, pendingCount, confirmedCount, tournamentRows, pendingRows]) if (result.error) throw result.error

  // One row more than a page was read to tell whether a next page exists.
  const allTournaments = (tournamentRows.data ?? []) as DashboardTournament[]
  const tournaments = allTournaments.slice(0, DASHBOARD_PAGE_SIZE)
  const allPending = (pendingRows.data ?? []) as unknown as DashboardPendingTeam[]
  const pendingTeams = allPending.slice(0, DASHBOARD_PAGE_SIZE)

  const [teamRows, paymentRows] = await Promise.all([
    tournaments.length
      ? client.from('teams').select('tournament_id, status').in('tournament_id', tournaments.map(item => item.id))
      : Promise.resolve({ data: [], error: null }),
    pendingTeams.length
      ? client.from('payments').select('*').in('team_id', pendingTeams.map(item => item.id))
      : Promise.resolve({ data: [], error: null }),
  ])
  if (teamRows.error) throw teamRows.error
  if (paymentRows.error) throw paymentRows.error

  const teamCounts: Record<string, { total: number; pending: number }> = {}
  for (const item of tournaments) teamCounts[item.id] = { total: 0, pending: 0 }
  for (const row of (teamRows.data ?? []) as { tournament_id: string; status: string }[]) {
    const counts = teamCounts[row.tournament_id]
    if (!counts) continue
    counts.total += 1
    if (row.status === 'pending') counts.pending += 1
  }
  const paymentsByTeam = Object.fromEntries(((paymentRows.data ?? []) as DashboardPayment[]).map(payment => [payment.team_id, payment]))

  return {
    stats: { tournaments: tournamentCount.count ?? 0, pending: pendingCount.count ?? 0, confirmed: confirmedCount.count ?? 0 },
    tournaments,
    tournamentsHasNext: allTournaments.length > DASHBOARD_PAGE_SIZE,
    teamCounts,
    pendingTeams,
    pendingHasNext: allPending.length > DASHBOARD_PAGE_SIZE,
    paymentsByTeam,
  }
}
