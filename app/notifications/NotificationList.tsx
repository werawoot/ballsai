'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Award, Bell, BellOff, CalendarClock, Check, CheckCheck, ChevronRight, ClipboardCheck, Dumbbell, HeartHandshake, MapPin, Megaphone, Trophy, Users } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { bangkokToday } from '@/lib/public-tournaments'
import { groupNotificationsByDay, notificationAge, notificationHref, notificationKind, type NotificationFilter, type NotificationKind } from '@/lib/notification-feed'
import { useApiErrorText } from '@/lib/use-api-error-text'

export type NotificationItem = {
  id: string
  notification_type: string | null
  title: string
  body: string
  href: string | null
  read_at: string | null
  created_at: string
}

const ICONS: Record<NotificationKind, ReactNode> = {
  result: <ClipboardCheck size={20} />,
  badge: <Award size={20} />,
  hall: <Trophy size={20} />,
  team: <Users size={20} />,
  family: <HeartHandshake size={20} />,
  venue: <MapPin size={20} />,
  news: <Megaphone size={20} />,
  event: <CalendarClock size={20} />,
  training: <Dumbbell size={20} />,
  other: <Bell size={20} />,
}

// Opening an unread notification marks it read on the way, so the bell and the list agree
// without a second tap. The tick marks one read without leaving the page.
export default function NotificationList({ notifications, unreadCount, view, page }: { notifications: NotificationItem[]; unreadCount: number; view: NotificationFilter; page: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [readNow, setReadNow] = useState<Set<string>>(() => new Set())
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const t = useTranslations('notifications')
  const errorText = useApiErrorText()
  const format = useFormatter()
  const isRead = (item: NotificationItem) => Boolean(item.read_at) || readNow.has(item.id)

  const send = async (key: string, path: string, method: string) => {
    if (busy) return
    setBusy(key); setFeedback(null)
    const response = await fetch(path, { method }).catch(() => null)
    const body = response ? await response.json().catch(() => null) as { code?: string; error?: string } | null : null
    setBusy(null)
    if (!response?.ok) { setFeedback({ tone: 'error', text: errorText(body, t('updateFailed')) }); return }
    if (key !== 'all') setReadNow(previous => new Set(previous).add(key))
    setFeedback({ tone: 'ok', text: key === 'all' ? t('allMarkedRead') : t('markedRead') })
    router.refresh()
  }

  const open = (item: NotificationItem) => {
    if (isRead(item)) return
    setReadNow(previous => new Set(previous).add(item.id))
    // keepalive lets the write finish while the next page loads.
    void fetch(`/api/notifications/${item.id}`, { method: 'PATCH', keepalive: true }).catch(() => null)
  }

  const age = (iso: string) => {
    const value = notificationAge(iso)
    if (value.unit === 'now') return t('ageNow')
    if (value.unit === 'minute') return t('ageMinutes', { count: value.value })
    if (value.unit === 'hour') return t('ageHours', { count: value.value })
    return format.dateTime(new Date(iso), { timeStyle: 'short' })
  }
  const dayLabel = (day: string, label: 'today' | 'yesterday' | 'date') =>
    label === 'today' ? t('today') : label === 'yesterday' ? t('yesterday')
      : format.dateTime(new Date(`${day}T12:00:00+07:00`), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const markAll = unreadCount > 0 && <div className="nt-toolbar">
    <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" aria-busy={busy === 'all'} disabled={busy !== null} onClick={() => void send('all', '/api/notifications/read-all', 'POST')}>
      <CheckCheck size={16} aria-hidden="true" />{busy === 'all' ? t('updating') : t('markAllRead', { count: unreadCount })}
    </button>
  </div>
  const status = feedback && <p className={feedback.tone === 'ok' ? 'nt-ok' : 'nt-alert'} role={feedback.tone === 'ok' ? 'status' : 'alert'}>{feedback.text}</p>

  if (notifications.length === 0) {
    const caughtUp = view === 'unread' && page === 1
    return <>
      {status}
      <div className="ui-card nt-empty">
        <span className="nt-empty-icon" aria-hidden="true">{caughtUp ? <CheckCheck size={26} /> : <BellOff size={26} />}</span>
        <h2>{page > 1 ? t('emptyPage') : caughtUp ? t('emptyUnread') : t('empty')}</h2>
        <p>{page > 1 ? t('emptyPageHint') : caughtUp ? t('emptyUnreadHint') : t('emptyHint')}</p>
        {(page > 1 || caughtUp) && <Link href="/notifications" className="ui-btn ui-btn-ghost ui-btn-sm">{t('backToAll')}</Link>}
      </div>
    </>
  }

  return <>
    {markAll}
    {status}
    {groupNotificationsByDay(notifications, bangkokToday()).map(group => <section key={group.day} className="nt-day" aria-label={dayLabel(group.day, group.label)}>
      <h2 className="nt-day-label">{dayLabel(group.day, group.label)}</h2>
      <ul className="nt-list">
        {group.items.map(item => {
          const read = isRead(item)
          const kind = notificationKind(item.notification_type)
          return <li key={item.id} className={`nt-item${read ? '' : ' is-unread'}`}>
            <Link href={notificationHref(item.href)} className="nt-link" onClick={() => open(item)}>
              <span className={`nt-icon is-${kind}`} aria-hidden="true">{ICONS[kind]}</span>
              <span className="nt-text">
                <span className="nt-meta">
                  <span className="nt-kind">{t(`kind.${kind}`)}</span>
                  <time dateTime={item.created_at} suppressHydrationWarning>{age(item.created_at)}</time>
                  {!read && <span className="nt-dot"><span className="nt-sr">{t('unreadTag')}</span></span>}
                </span>
                <strong className="nt-item-title">{item.title}</strong>
                {item.body && <span className="nt-body">{item.body}</span>}
              </span>
              <ChevronRight className="nt-chevron" size={18} aria-hidden="true" />
            </Link>
            {!read && <button type="button" className="nt-mark" aria-busy={busy === item.id} disabled={busy !== null} onClick={() => void send(item.id, `/api/notifications/${item.id}`, 'PATCH')} aria-label={t('markReadLabel', { title: item.title })} title={t('markRead')}>
              <Check size={18} aria-hidden="true" />
            </button>}
          </li>
        })}
      </ul>
    </section>)}
  </>
}
