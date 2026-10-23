import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { fetchUnreadNotificationCount } from '@/lib/notification-count'
import { NOTIFICATION_PAGE_SIZE, parseNotificationFilter } from '@/lib/notification-feed'
import { parsePage } from '@/lib/pagination'
import NotificationList, { type NotificationItem } from './NotificationList'
import PageHeader from '@/components/PageHeader'
import Pagination from '@/components/Pagination'
import { glassSceneStyle, PAGE_PHOTOS } from '@/lib/stock-photos'
import '../glass.css'
import './notifications.css'

// On the light glass design (ADR-014): a photo head with what is still unread and two
// tabs, then frosted cards: the person's own notifications by Bangkok day, one page at a time. Nothing is
// capped: the unread number is a count on the server (partial index
// notifications_user_unread_idx), and older rows are on the next page
// (notifications_user_created_idx). RLS shows each person their own rows only.

export default async function NotificationsPage(props: { searchParams: Promise<{ page?: string | string[]; view?: string | string[] }> }) {
  const searchParams = await props.searchParams
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/notifications')

  const page = parsePage(searchParams?.page)
  const view = parseNotificationFilter(searchParams?.view)
  const from = (page - 1) * NOTIFICATION_PAGE_SIZE
  let query = supabase
    .from('notifications')
    .select('id, notification_type, title, body, href, read_at, created_at')
    .eq('user_id', user.id)
  if (view === 'unread') query = query.is('read_at', null)
  // One row past the page says whether a next page exists, without counting them all.
  const [{ data, error }, unread, t] = await Promise.all([
    query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, from + NOTIFICATION_PAGE_SIZE),
    fetchUnreadNotificationCount(supabase, user.id),
    getTranslations('notifications'),
  ])
  const rows = (data ?? []) as NotificationItem[]
  const hasNext = rows.length > NOTIFICATION_PAGE_SIZE
  const notifications = rows.slice(0, NOTIFICATION_PAGE_SIZE)
  const unreadCount = unread ?? 0
  const tab = (target: 'all' | 'unread') => target === 'all' ? '/notifications' : '/notifications?view=unread'

  return (
    <main className="bds-page nt-page gl gl-scene" style={glassSceneStyle(PAGE_PHOTOS.notifications)}>
      <PageHeader />
      <div className="nt-stadium">
        <div className="nt-stadium-inner">
          <p className="nt-eyebrow">{t('eyebrow')}</p>
          <div className="nt-headline">
            <h1 className="nt-title">{t('title')}</h1>
            <p className={`nt-count${unreadCount > 0 ? ' is-on' : ''}`} role="status">
              {unreadCount > 0
                ? <><b>{unreadCount > 99 ? '99+' : unreadCount}</b><span>{t('unreadShort')}</span></>
                : <span>{t('allCaughtUp')}</span>}
            </p>
          </div>
          <p className="nt-intro">{t('intro')}</p>
          <nav className="nt-tabs" aria-label={t('tabsLabel')}>
            <Link href={tab('all')} className={view === 'all' ? 'is-on' : undefined} aria-current={view === 'all' ? 'page' : undefined}>{t('tabAll')}</Link>
            <Link href={tab('unread')} className={view === 'unread' ? 'is-on' : undefined} aria-current={view === 'unread' ? 'page' : undefined}>
              {t('tabUnread')}{unreadCount > 0 && <span className="nt-tab-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </Link>
          </nav>
        </div>
      </div>
      <section className="nt-wrap">
        {error
          ? <p className="nt-alert" role="alert">{t('loadFailed')}</p>
          : <NotificationList notifications={notifications} unreadCount={unreadCount} view={view} page={page} />}
        <Pagination basePath="/notifications" page={page} hasNext={hasNext} params={view === 'unread' ? { view } : {}} />
      </section>
    </main>
  )
}
