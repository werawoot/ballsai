'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EyeOff, ExternalLink, Loader2, Eye, Trash2 } from 'lucide-react'

export type ModerationItem = {
  id: number
  title: string
  mediaType: 'image' | 'video'
  moderationStatus: 'visible' | 'hidden'
  athleteName: string
  createdAt: string
  reports: Array<{ id: number; reason: string; createdAt: string }>
}

export default function HighlightModerationList({ items, emptyText }: { items: ModerationItem[]; emptyText: string }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState(0)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const moderate = async (item: ModerationItem, action: 'hide' | 'unhide' | 'delete') => {
    if (action === 'delete' && !window.confirm(`ลบ "${item.title}" ของ ${item.athleteName} อย่างถาวร?\n\nไฟล์จะถูกลบออกจากที่เก็บด้วย และกู้คืนไม่ได้`)) return
    setBusyId(item.id)
    setMessage(null)
    const response = await fetch(`/api/highlights/${item.id}/moderate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const payload = await response.json().catch(() => null) as { error?: string } | null
    setBusyId(0)
    if (!response.ok) {
      setMessage({ kind: 'error', text: payload?.error ?? 'ดำเนินการไม่สำเร็จ' })
      return
    }
    const done = action === 'hide' ? 'ซ่อนแล้ว' : action === 'unhide' ? 'แสดงอีกครั้งแล้ว' : 'ลบแล้ว'
    setMessage({ kind: 'success', text: `${item.title}: ${done}` })
    router.refresh()
  }

  if (items.length === 0) {
    return <p style={{ fontSize: 12, color: '#888', margin: 0 }}>{emptyText}</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {message && (
        <div style={{ background: message.kind === 'success' ? '#dcfce7' : '#fee2e2', color: message.kind === 'success' ? '#166534' : '#991b1b', borderRadius: 10, padding: '10px 12px', fontSize: 12, fontWeight: 700 }}>
          {message.text}
        </div>
      )}

      {items.map(item => {
        const isHidden = item.moderationStatus === 'hidden'
        return (
          <div key={item.id} style={{ border: '1.5px solid #eee', borderRadius: 12, padding: 12, background: isHidden ? '#fafafa' : 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#111' }}>{item.title}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
                  {item.athleteName} · {item.mediaType === 'video' ? 'วิดีโอ' : 'รูปภาพ'} · {new Date(item.createdAt).toLocaleDateString('th-TH')}
                </div>
              </div>
              {isHidden && <span style={{ flex: '0 0 auto', background: '#f3f4f6', color: '#6b7280', borderRadius: 20, padding: '5px 11px', fontSize: 11, fontWeight: 800 }}>ซ่อนอยู่</span>}
            </div>

            {item.reports.length > 0 && (
              <ul style={{ margin: '10px 0 0', padding: '10px 0 0 18px', borderTop: '1px solid #f0f0f0', fontSize: 11, color: '#991b1b', lineHeight: 1.6 }}>
                {item.reports.map(report => (
                  <li key={report.id}>{report.reason} <span style={{ color: '#999' }}>· {new Date(report.createdAt).toLocaleDateString('th-TH')}</span></li>
                ))}
              </ul>
            )}

            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
              <a href={`/api/highlights/${item.id}/media`} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'white', color: '#111', border: '1.5px solid #e5e5e5', borderRadius: 20, padding: '6px 12px', fontSize: 11, fontWeight: 800, textDecoration: 'none' }}>
                <ExternalLink size={13} /> เปิดดู
              </a>
              <button onClick={() => moderate(item, isHidden ? 'unhide' : 'hide')} disabled={Boolean(busyId)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: isHidden ? '#111827' : '#fff8e6', color: isHidden ? 'white' : '#854d0e', border: `1.5px solid ${isHidden ? '#111827' : '#f4d98b'}`, borderRadius: 20, padding: '6px 12px', fontSize: 11, fontWeight: 800, cursor: busyId ? 'default' : 'pointer' }}>
                {busyId === item.id ? <Loader2 size={13} /> : isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
                {isHidden ? 'แสดงอีกครั้ง' : 'ซ่อนทันที'}
              </button>
              <button onClick={() => moderate(item, 'delete')} disabled={Boolean(busyId)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'white', color: '#CC0001', border: '1.5px solid #f2d0d0', borderRadius: 20, padding: '6px 12px', fontSize: 11, fontWeight: 800, cursor: busyId ? 'default' : 'pointer' }}>
                <Trash2 size={13} /> ลบถาวร
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
