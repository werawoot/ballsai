import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bell, Check, ChevronRight } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'

type Notification = {
  id: string
  title: string
  body: string
  href: string | null
  read_at: string | null
  created_at: string
}

export default async function NotificationsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/notifications')

  const { data } = await supabase
    .from('notifications')
    .select('id, title, body, href, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  const notifications = (data ?? []) as Notification[]
  const formatDate = (value: string) => new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

  return <main className="bds-page" style={{ minHeight: '100vh', background: '#f7f7f5' }}>
    <header className="bds-header" style={{ background: '#CC0001', color: '#fff', padding: '18px 20px' }}>
      <Link href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: 900 }}>BallDoenSai.com</Link>
    </header>
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '28px 18px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Bell size={26} color="#CC0001" />
        <div><p style={{ margin: 0, color: '#CC0001', fontSize: 11, fontWeight: 800, letterSpacing: 1.5 }}>YOUR UPDATES</p><h1 style={{ margin: 0, fontSize: 32 }}>การแจ้งเตือน</h1></div>
      </div>
      {notifications.length === 0 ? <div style={{ background: '#fff', border: '1px solid #e6e6e3', padding: 32, textAlign: 'center', color: '#777' }}>ยังไม่มีการแจ้งเตือน</div> : <div style={{ display: 'grid', gap: 10 }}>{notifications.map(item => <Link key={item.id} href={item.href || '/notifications'} style={{ display: 'flex', alignItems: 'center', gap: 14, background: item.read_at ? '#fff' : '#fff8f7', border: `1px solid ${item.read_at ? '#e6e6e3' : '#f2b5b0'}`, borderRadius: 10, padding: '15px 16px', color: '#1b1b1b', textDecoration: 'none' }}><span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: '50%', background: item.read_at ? '#eee' : '#CC0001', color: item.read_at ? '#777' : '#fff' }}>{item.read_at ? <Check size={16} /> : <Bell size={16} />}</span><span style={{ flex: 1 }}><strong style={{ display: 'block', fontSize: 15 }}>{item.title}</strong><span style={{ display: 'block', color: '#666', fontSize: 13, marginTop: 3 }}>{item.body}</span><small style={{ color: '#999', fontSize: 11 }}>{formatDate(item.created_at)}</small></span><ChevronRight size={18} color="#aaa" /></Link>)}</div>}
    </section>
  </main>
}
