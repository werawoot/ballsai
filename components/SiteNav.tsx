import Link from 'next/link'
import { Bell, Building2, ClipboardList, Handshake, House, Search, Trophy, User, Users } from 'lucide-react'

type SiteNavProps = { active?: 'athletes' | 'ranking' | 'tournaments' | 'venues' | 'profile' }

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

export default function SiteNav({ active }: SiteNavProps) {
  return <nav className="bds-nav" aria-label="เมนูหลัก">
    {items.map(item => {
      const Icon = item.icon
      const isActive = item.id === active
      return <Link key={item.id} href={item.href} className={`bds-nav-item ${isActive ? 'is-active' : ''}`}>
        <Icon size={19} />
        <span>{item.label}</span>
      </Link>
    })}
  </nav>
}
