import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { unreadBadge } from '@/lib/notification-unread'

// A single inline entry point to /notifications for the venue pages, which have their
// own headers rather than SiteNav.
export default function NotificationBellLink({ unreadCount, tone = 'dark' }: {
  unreadCount: number | null | undefined
  tone?: 'dark' | 'light'
}) {
  const t = useTranslations('notifications')
  const badge = unreadBadge(unreadCount)
  const color = tone === 'dark' ? '#f5c518' : '#CC0001'

  return <Link
    href="/notifications"
    aria-label={badge ? t('bellLabelUnread', { count: badge.count }) : t('bellLabel')}
    style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5, color, textDecoration: 'none', fontSize: 12, fontWeight: 800 }}
  >
    <Bell size={15} />
    <span>{t('bell')}</span>
    {badge && <span aria-hidden="true" style={{ minWidth: 16, borderRadius: 9, padding: '0 4px', background: '#CC0001', color: '#fff', fontSize: 10, fontWeight: 900, lineHeight: '16px', textAlign: 'center' }}>{badge.text}</span>}
  </Link>
}
