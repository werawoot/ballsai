// Counts only; no notification row is transferred. Used by the pages that already run
// an authenticated Supabase query, so statically rendered pages stay static.
//
// `from` is typed as returning `unknown` on purpose. Describing the real builder here
// makes TypeScript compare it structurally against the full Supabase client type, which
// fails with "Type instantiation is excessively deep". The narrow chain shape is applied
// after the call instead.
type UnreadCountClient = { from: (table: string) => unknown }

type UnreadCountChain = {
  select: (columns: string, options: { count: 'exact'; head: true }) => {
    eq: (column: string, value: string) => {
      is: (column: string, value: null) => Promise<{ count: number | null; error: unknown }>
    }
  }
}

export async function fetchUnreadNotificationCount(
  supabase: UnreadCountClient,
  userId: string | null | undefined,
) {
  if (!userId) return null
  const { count, error } = await (supabase.from('notifications') as UnreadCountChain)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)
  // A missing notifications table must never break an unrelated page.
  if (error) return null
  return count ?? 0
}
