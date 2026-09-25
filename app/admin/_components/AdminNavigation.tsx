'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  ChevronRight,
  ClipboardList,
  Database,
  Gavel,
  History,
  ImageIcon,
  LayoutDashboard,
  Medal,
  ShieldCheck,
  Trophy,
  UsersRound,
} from 'lucide-react'

type NavItem = {
  href: string
  label: string
  detail: string
  icon: React.ReactNode
}

const primary: NavItem[] = [
  { href: '/admin/operations', label: 'Command Center', detail: 'คิวงานและความพร้อม', icon: <LayoutDashboard size={18} /> },
  { href: '/admin', label: 'Athletes & Ranking', detail: 'Card และ Power Rating', icon: <Medal size={18} /> },
  { href: '/admin/trust', label: 'Trust & Integrity', detail: 'หลักฐานและข้อโต้แย้ง', icon: <ShieldCheck size={18} /> },
  { href: '/admin/moderation', label: 'Moderation', detail: 'รายงาน Highlight', icon: <Gavel size={18} /> },
  { href: '/admin/venue-photos', label: 'Venue Photos', detail: 'ตรวจรูปสนาม', icon: <ImageIcon size={18} /> },
  { href: '/admin/audit', label: 'Audit Trail', detail: 'ใครทำอะไร เมื่อไร', icon: <History size={18} /> },
]

const system: NavItem[] = [
  { href: '/admin/hall', label: 'Hall of Fame', detail: 'Official records', icon: <Trophy size={18} /> },
  { href: '/admin/create', label: 'Ranking Setup', detail: 'เพิ่ม Athlete Account', icon: <UsersRound size={18} /> },
  { href: '/admin/infrastructure', label: 'Infrastructure', detail: 'ข้อมูลพื้นฐานระบบ', icon: <Database size={18} /> },
]

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname()
  const active = item.href === '/admin'
    ? pathname === '/admin'
    : pathname === item.href || pathname.startsWith(`${item.href}/`)

  return (
    <Link className={`admin-nav-link${active ? ' admin-nav-link-active' : ''}`} href={item.href} aria-current={active ? 'page' : undefined}>
      <span className="admin-nav-icon">{item.icon}</span>
      <span className="admin-nav-copy"><b>{item.label}</b><small>{item.detail}</small></span>
      <ChevronRight className="admin-nav-chevron" size={15} aria-hidden="true" />
    </Link>
  )
}

export default function AdminNavigation() {
  return (
    <aside className="admin-nav" aria-label="เมนูผู้ดูแลระบบ">
      <Link className="admin-nav-brand" href="/admin/operations">
        <span className="admin-nav-brand-mark"><Activity size={17} /></span>
        <span><b>BALLDOENSAI</b><small>CONTROL PLANE</small></span>
      </Link>

      <div className="admin-nav-status"><i /><span>ADMIN SESSION</span><b>Protected</b></div>

      <nav className="admin-nav-groups">
        <section><p>RUN THE PLATFORM</p>{primary.map(item => <NavLink key={item.href} item={item} />)}</section>
        <section><p>RECORDS &amp; SYSTEM</p>{system.map(item => <NavLink key={item.href} item={item} />)}</section>
      </nav>

      <Link className="admin-nav-public" href="/">
        <ClipboardList size={15} /> เปิดหน้าเว็บไซต์
      </Link>
    </aside>
  )
}
