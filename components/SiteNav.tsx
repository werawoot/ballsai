import Link from 'next/link'
import { Bell, Building2, ClipboardList, Handshake, House, Search, Trophy, User, Users } from 'lucide-react'
import { unreadBadge } from '@/lib/notification-unread'

// unreadCount is optional so the statically rendered pages keep rendering statically;
// only pages that already query Supabase pass it in.
type SiteNavProps = { active?: 'athletes' | 'ranking' | 'tournaments' | 'venues' | 'profile'; unreadCount?: number | null }

const items = [
  { id: 'home', href: '/', label: 'หน้าแรก', icon: House },
  { id: 'athletes', href: '/athletes', label: 'นักกีฬา', icon: Search },
  { id: 'ranking', href: '/ranking', label: 'Ranking', icon: Trophy },
  { id: 'tournaments', href: '/tournaments', label: 'รายการแข่ง', icon: ClipboardList },
  { id: 'venues', href: '/venues', label: 'สนาม', icon: Building2 },
  { id: 'sponsorships', href: '/sponsorships', label: 'โอกาส', icon: Handshake },
  { id: 'profile', href: '/profile', label: 'โปรไฟล์', icon: User },
  { id: 'notifications', href: '/notifications', label: 'แจ้งเตือน', icon: Bell },
  { id: 'team-members', href: '/team-members', label: 'สมาชิกทีม', icon: Users },
] as const

export default function SiteNav({ active, unreadCount }: SiteNavProps) {
  const badge = unreadBadge(unreadCount)

  return <nav className="bds-nav" aria-label="เมนูหลัก">
    {items.map(item => {
      const Icon = item.icon
      const isActive = item.id === active
      const itemBadge = item.id === 'notifications' ? badge : null
      return <Link key={item.id} href={item.href} className={`bds-nav-item ${isActive ? 'is-active' : ''}`} aria-label={itemBadge ? `${item.label} · ${itemBadge.label}` : undefined}>
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <Icon size={19} />
          {itemBadge && <span aria-hidden="true" style={{ position: 'absolute', top: -6, left: 11, minWidth: 16, borderRadius: 9, padding: '0 4px', background: '#CC0001', color: '#fff', fontSize: 10, fontWeight: 900, lineHeight: '16px', textAlign: 'center' }}>{itemBadge.text}</span>}
        </span>
        <span>{item.label}</span>
      </Link>
    })}
  </nav>
}
