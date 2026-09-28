import type { SupabaseClient } from '@supabase/supabase-js'

export const TOURNAMENTS_PAGE_SIZE = 20

// The columns the public list shows. The row carries more (select *), which the page
// passes on untouched.
export type PublicTournament = {
  id: string
  name: string
  description: string | null
  location: string | null
  start_date: string
  fee: number
  status: string | null
}

// One page of tournaments, in start-date order. One row more than a page is fetched to
// tell whether a next page exists without a count(*) over the whole table.
export async function fetchPublicTournamentsPage(client: SupabaseClient, { page }: { page: number }) {
  const from = (page - 1) * TOURNAMENTS_PAGE_SIZE
  const { data, error } = await client
    .from('tournaments')
    .select('*')
    .order('start_date', { ascending: true })
    // Many tournaments share a start date; the unique tiebreak keeps pages disjoint.
    .order('id', { ascending: true })
    .range(from, from + TOURNAMENTS_PAGE_SIZE)
  if (error) throw error
  const rows = (data ?? []) as PublicTournament[]
  return { tournaments: rows.slice(0, TOURNAMENTS_PAGE_SIZE), hasNext: rows.length > TOURNAMENTS_PAGE_SIZE }
}
