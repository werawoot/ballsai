import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bell } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { unreadBadge } from '@/lib/notification-unread'
import NotificationList, { type NotificationItem } from './NotificationList'

export default async function NotificationsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/notifications')

  const { data } = await supabase
    .from('notifications')
    .select('id, title, body, href, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  const notifications = (data ?? []) as NotificationItem[]
  const badge = unreadBadge(notifications.filter(item => !item.read_at).length)

  return <main className="bds-page" style={{ minHeight: '100vh', background: '#f7f7f5' }}>
    <header className="bds-header" style={{ background: '#CC0001', color: '#fff', padding: '18px 20px' }}>
      <Link href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: 900 }}>BallDoenSai.com</Link>
    </header>
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '28px 18px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Bell size={26} color="#CC0001" />
        <div>
          <p style={{ margin: 0, color: '#CC0001', fontSize: 11, fontWeight: 800, letterSpacing: 1.5 }}>YOUR UPDATES</p>
          <h1 style={{ margin: 0, fontSize: 32 }}>การแจ้งเตือน</h1>
          {badge && <p style={{ margin: '4px 0 0', color: '#b91c1c', fontSize: 12, fontWeight: 800 }}>{badge.label}</p>}
        </div>
      </div>
      <NotificationList notifications={notifications} />
    </section>
  </main>
}
