import type { SupabaseClient } from '@supabase/supabase-js'

// /organization lists the academies, clubs and schools the user belongs to. The query
// itself asks for "my accepted memberships": RLS alone would hand an admin every
// organization in the country, each with every member embedded just to be counted.
export const ORGANIZATIONS_PAGE_SIZE = 10

export type MyOrganization = {
  id: string
  name: string
  kind: string
  province: string
  description: string
  role: string
  memberCount: number
}

type Membership = { id: string; role: string; organizations: Omit<MyOrganization, 'role' | 'memberCount'> | null }

export async function fetchMyOrganizationsPage(client: SupabaseClient, { userId, page }: { userId: string; page: number }) {
  const from = (page - 1) * ORGANIZATIONS_PAGE_SIZE
  const { data, error } = await client
    .from('organization_members')
    .select('id, role, organizations(id, name, kind, province, description)')
    .eq('user_id', userId)
    .eq('status', 'accepted')
    .order('invited_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + ORGANIZATIONS_PAGE_SIZE)
  if (error) throw error
  const rows = (data ?? []) as unknown as Membership[]
  const memberships = rows.slice(0, ORGANIZATIONS_PAGE_SIZE).filter(row => row.organizations)

  // One count per organization on the page (at most ten), answered by the
  // (organization_id, status) index; an academy of hundreds costs the same as one of two.
  const counts = await Promise.all(memberships.map(row => client
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', row.organizations!.id)
    .eq('status', 'accepted')))
  for (const result of counts) if (result.error) throw result.error

  return {
    organizations: memberships.map((row, index) => ({ ...row.organizations!, role: row.role, memberCount: counts[index].count ?? 0 })),
    hasNext: rows.length > ORGANIZATIONS_PAGE_SIZE,
  }
}
