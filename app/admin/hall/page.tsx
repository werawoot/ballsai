import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Trophy } from 'lucide-react'
import HallAwardForm from './HallAwardForm'
import { ACTIVE_SEASON, ACTIVE_SPORT } from '@/lib/season'

export default async function AdminHallPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => cookieStore.getAll(), setAll: items => items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const [{ data: profile }, { data: players }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('player_ranks').select('id, player_id, player_name, team, province, position').eq('sport', ACTIVE_SPORT).eq('season', ACTIVE_SEASON).order('pts', { ascending: false }).limit(500),
  ])
  if (profile?.role !== 'admin') redirect('/')
  return <main style={{ background: '#f7f4ed', minHeight: '100vh', padding: 24 }}><header style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between', margin: '0 auto 34px', maxWidth: 900 }}><Link href="/admin" style={{ alignItems: 'center', color: '#182033', display: 'flex', fontWeight: 800, gap: 7, textDecoration: 'none' }}><ArrowLeft size={17} /> กลับ Admin</Link><Link href="/hall-of-fame" style={{ alignItems: 'center', color: '#a36e00', display: 'flex', fontWeight: 800, gap: 7, textDecoration: 'none' }}><Trophy size={17} /> ดู Hall of Fame</Link></header><div style={{ margin: '0 auto', maxWidth: 900 }}><p style={{ color: '#c91c24', fontFamily: 'var(--font-oswald)', fontSize: 11, fontWeight: 800, letterSpacing: 2 }}>OFFICIAL RECORDS</p><h1 style={{ color: '#182033', fontFamily: 'var(--font-oswald)', fontSize: 46, lineHeight: .9, margin: '7px 0 26px' }}>HALL OF FAME<br />ADMIN</h1><HallAwardForm players={(players ?? []) as never[]} /></div></main>
}
