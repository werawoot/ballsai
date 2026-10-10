'use client'
import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Megaphone } from 'lucide-react'
import { eventTimeParts } from '@/lib/team-events'
import './team-page.css'

export type MyAnnouncementRow = { id: string; team_name: string; body: string; created_at: string; read_at: string | null }

// The athlete's and the guardian's side of team announcements (sql/71,
// my_team_announcements): newest first, unread ones marked "new". Showing the list marks
// those as read, once, which is what the coach's "read by N of M" counts.
export default function MyNewsPanel({ rows }: { rows: MyAnnouncementRow[] }) {
  const t = useTranslations('teamNews')
  const marked = useRef(false)
  const unread = rows.filter(row => !row.read_at).map(row => row.id)
  const unreadKey = unread.join(',')

  useEffect(() => {
    if (marked.current || !unreadKey) return
    marked.current = true
    void fetch('/api/team-announcements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read', data: { ids: unreadKey.split(',') } }),
    }).then(response => response.json()).catch(() => null)
  }, [unreadKey])

  if (!rows.length) return null
  const when = (iso: string) => { const at = eventTimeParts(iso); return t('when', { day: at.day, month: at.month, time: at.time }) }

  return (
    <section className="ui-card me-card" aria-labelledby="me-news">
      <h2 id="me-news"><Megaphone size={17} aria-hidden="true" /> {t('myTitle')}</h2>
      {rows.map(row => <article className="me-item" key={row.id}>
        <div className="te-top">
          <span className="me-for">{t('fromTeam', { team: row.team_name })}</span>
          <span className="tn-when">{!row.read_at && <b className="tn-new">{t('unread')}</b>}<time dateTime={row.created_at}>{when(row.created_at)}</time></span>
        </div>
        <p className="tn-body">{row.body}</p>
      </article>)}
    </section>
  )
}
