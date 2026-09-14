import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import SiteNav from '@/components/SiteNav'
import TeamMembersClient from './TeamMembersClient'
import Link from 'next/link'
import { ClipboardPenLine } from 'lucide-react'

export default async function TeamMembersPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: values => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/team-members')
  const [{ data: teams }, { data: invites }] = await Promise.all([
    supabase.from('teams').select('id, name, tournament_id, status, tournaments(name)').eq('created_by', user.id).order('created_at', { ascending: false }),
    supabase.from('team_members').select('id, team_id, athlete_id, status, invited_at, teams(name)').eq('athlete_id', user.id).order('created_at', { ascending: false }),
  ])
  return <main style={{ minHeight: '100vh', background: '#f7f7f7' }}><SiteNav /><div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px 80px' }}><h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 32, marginBottom: 8 }}>TEAM ROSTER</h1><p style={{ color: '#777', marginBottom: 14 }}>เชื่อมสมาชิกทีมกับบัญชีจริง เพื่อให้ผลแข่งและเส้นทางนักกีฬาถูกต้อง</p>{teams?.length ? <Link href="/match-plan" style={{ marginBottom: 20, background: '#101827', color: 'white', borderRadius: 10, padding: '11px 13px', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800, textDecoration: 'none' }}><ClipboardPenLine size={16} color="#f5c518" /> วางแผนก่อนแข่ง</Link> : null}<TeamMembersClient teams={teams ?? []} invites={(invites ?? []) as never[]} /></div></main>
}
