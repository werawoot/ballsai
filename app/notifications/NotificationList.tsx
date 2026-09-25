'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, Check, ChevronRight } from 'lucide-react'

export type NotificationItem = {
  id: string
  title: string
  body: string
  href: string | null
  read_at: string | null
  created_at: string
}

export default function NotificationList({ notifications }: { notifications: NotificationItem[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const formatDate = (value: string) => new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  const unread = notifications.filter(item => !item.read_at)

  const send = async (key: string, path: string, method: string) => {
    if (busy) return
    setBusy(key); setFeedback(null)
    const response = await fetch(path, { method }).catch(() => null)
    const result = response ? await response.json().catch(() => null) as { error?: string } | null : null
    setBusy(null)
    if (!response || !response.ok) {
      setFeedback({ tone: 'error', text: result?.error ?? 'อัปเดตการแจ้งเตือนไม่สำเร็จ' })
      return
    }
    setFeedback({ tone: 'success', text: 'ทำเครื่องหมายอ่านแล้ว' })
    router.refresh()
  }

  if (notifications.length === 0) {
    return <div style={{ background: '#fff', border: '1px solid #e6e6e3', padding: 32, textAlign: 'center', color: '#777' }}>ยังไม่มีการแจ้งเตือน</div>
  }

  return <div style={{ display: 'grid', gap: 10 }}>
    {feedback && <p role="status" aria-live="polite" style={{ margin: 0, padding: '10px 12px', borderRadius: 9, background: feedback.tone === 'error' ? '#fff1f1' : '#ecfdf5', color: feedback.tone === 'error' ? '#b91c1c' : '#166534', fontSize: 13, fontWeight: 700 }}>{feedback.text}</p>}
    {unread.length > 0 && <button type="button" aria-busy={busy === 'all'} disabled={busy !== null} onClick={() => void send('all', '/api/notifications/read-all', 'POST')} style={{ justifySelf: 'start', border: '1px solid #e6e6e3', borderRadius: 8, background: '#fff', color: '#1b1b1b', padding: '8px 12px', fontWeight: 800, fontSize: 12, cursor: busy ? 'wait' : 'pointer' }}>
      {busy === 'all' ? 'กำลังอัปเดต...' : `ทำเครื่องหมายอ่านแล้วทั้งหมด (${unread.length})`}
    </button>}
    {notifications.map(item => <article key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: item.read_at ? '#fff' : '#fff8f7', border: `1px solid ${item.read_at ? '#e6e6e3' : '#f2b5b0'}`, borderRadius: 10, padding: '15px 16px', flexWrap: 'wrap' }}>
      <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: '50%', background: item.read_at ? '#eee' : '#CC0001', color: item.read_at ? '#777' : '#fff', flex: '0 0 auto' }}>{item.read_at ? <Check size={16} /> : <Bell size={16} />}</span>
      <Link href={item.href || '/notifications'} style={{ flex: '1 1 200px', minWidth: 0, color: '#1b1b1b', textDecoration: 'none' }}>
        <strong style={{ display: 'block', fontSize: 15 }}>{item.title}</strong>
        <span style={{ display: 'block', color: '#666', fontSize: 13, marginTop: 3 }}>{item.body}</span>
        <small style={{ color: '#999', fontSize: 11 }}>{formatDate(item.created_at)}{item.read_at ? ' · อ่านแล้ว' : ' · ยังไม่อ่าน'}</small>
      </Link>
      {item.read_at
        ? <ChevronRight aria-hidden="true" size={18} color="#aaa" />
        : <button type="button" aria-busy={busy === item.id} disabled={busy !== null} onClick={() => void send(item.id, `/api/notifications/${item.id}`, 'PATCH')} aria-label={`ทำเครื่องหมายอ่านแล้ว: ${item.title}`} style={{ border: '1px solid #e6e6e3', borderRadius: 8, background: '#fff', color: '#166534', padding: '7px 10px', fontWeight: 800, fontSize: 12, cursor: busy ? 'wait' : 'pointer', flex: '0 0 auto' }}>อ่านแล้ว</button>}
    </article>)}
  </div>
}
