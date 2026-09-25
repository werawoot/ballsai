'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Eye, EyeOff, ImageOff, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { VENUE_PENDING_COPY, pendingButton, shouldStartAction } from '@/lib/pending-action'

export type VenuePhotoModerationItem = {
  id: string
  venueId: string
  venueName: string
  province: string
  caption: string
  isCover: boolean
  status: 'pending' | 'visible' | 'hidden'
  createdAt: string
}

type Preview = { state: 'loading' } | { state: 'ready'; url: string } | { state: 'error' }

function statusCopy(status: VenuePhotoModerationItem['status']) {
  if (status === 'visible') return { label: 'เผยแพร่แล้ว', tone: '#166534', background: '#ecfdf5' }
  if (status === 'hidden') return { label: 'ถูกซ่อน', tone: '#b91c1c', background: '#fff1f1' }
  return { label: 'รอตรวจสอบ', tone: '#9a3412', background: '#fff7ed' }
}

export default function VenuePhotoModerationList({ items }: { items: VenuePhotoModerationItem[] }) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Record<string, Preview>>({})
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    for (const item of items) {
      if (previews[item.id]) continue
      void fetch(`/api/venues/${item.venueId}/photos/${item.id}/preview`)
        .then(response => response.ok ? response.json() as Promise<{ url?: string }> : null)
        .then(data => setPreviews(current => ({ ...current, [item.id]: data?.url ? { state: 'ready', url: data.url } : { state: 'error' } })))
        .catch(() => setPreviews(current => ({ ...current, [item.id]: { state: 'error' } })))
    }
  }, [items, previews])

  const moderate = async (item: VenuePhotoModerationItem, status: 'visible' | 'hidden') => {
    // disabled locks the button on render; this refuses a press that arrives first.
    if (!shouldStartAction(pending)) return
    setPending(item.id); setFeedback(null)
    const response = await fetch(`/api/admin/venue-photos/${item.id}/moderate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    }).catch(() => null)
    const body = response ? await response.json().catch(() => null) as { error?: string } | null : null
    setPending(null)
    if (!response?.ok) { setFeedback(body?.error ?? 'เปลี่ยนสถานะรูปไม่สำเร็จ'); return }
    setFeedback(status === 'visible' ? 'อนุมัติรูปแล้ว' : 'ซ่อนรูปแล้ว')
    router.refresh()
  }

  if (!items.length) return <p style={{ color: '#728094', fontSize: 13, margin: 0 }}>ไม่มีรูปในคิวนี้</p>

  return <div style={{ display: 'grid', gap: 12 }}>
    {feedback && <p role="status" aria-live="polite" style={{ background: '#ecfdf5', borderRadius: 10, color: '#166534', fontSize: 12, fontWeight: 800, margin: 0, padding: '10px 12px' }}>{feedback}</p>}
    {items.map(item => {
      const copy = statusCopy(item.status)
      const preview = previews[item.id]
      const nextStatus = item.status === 'visible' ? 'hidden' : 'visible'
      // The pending label has to say which way the photo is moving, so approve and hide
      // read differently while the request is in flight.
      const action = pendingButton({
        pending,
        key: item.id,
        ...(nextStatus === 'visible' ? VENUE_PENDING_COPY.approve : VENUE_PENDING_COPY.hide),
      })
      return <article key={item.id} style={{ alignItems: 'flex-start', background: '#fff', border: '1px solid #e1e6ec', borderRadius: 13, display: 'flex', flexWrap: 'wrap', gap: 13, padding: 12 }}>
        <div style={{ background: '#0b2620', borderRadius: 9, display: 'grid', flex: '0 0 auto', height: 88, overflow: 'hidden', placeItems: 'center', position: 'relative', width: 118 }}>
          {preview?.state === 'ready'
            ? <Image src={preview.url} alt={`รูปสนาม ${item.venueName}`} fill sizes="118px" style={{ objectFit: 'cover' }} unoptimized />
            : preview?.state === 'error'
              ? <ImageOff aria-label="เปิดดูรูปไม่สำเร็จ" color="#fecaca" size={22} />
              : <Loader2 aria-label="กำลังโหลดรูป" color="rgba(255,255,255,.65)" size={22} />}
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <b style={{ color: '#172033', fontSize: 14 }}>{item.venueName}</b>
            <span style={{ background: copy.background, borderRadius: 99, color: copy.tone, fontSize: 10, fontWeight: 900, padding: '4px 8px' }}>{copy.label}</span>
            {item.isCover && <span style={{ background: '#fff7ed', borderRadius: 99, color: '#9a3412', fontSize: 10, fontWeight: 900, padding: '4px 8px' }}>รูปปก</span>}
          </div>
          <p style={{ color: '#728094', fontSize: 12, margin: '5px 0' }}>{item.province} · ส่งเมื่อ {new Date(item.createdAt).toLocaleDateString('th-TH')}</p>
          {item.caption && <p style={{ color: '#4b5563', fontSize: 12, margin: 0 }}>{item.caption}</p>}
        </div>
        <button type="button" aria-busy={action['aria-busy']} disabled={action.disabled} onClick={() => void moderate(item, nextStatus)} style={{ alignItems: 'center', background: nextStatus === 'visible' ? '#166534' : '#fff8e8', border: nextStatus === 'visible' ? 0 : '1px solid #f0d899', borderRadius: 9, color: nextStatus === 'visible' ? '#fff' : '#854d0e', cursor: action.disabled ? 'not-allowed' : 'pointer', display: 'inline-flex', fontSize: 12, fontWeight: 900, gap: 6, padding: '9px 11px' }}>
          {action.isPending ? <Loader2 aria-hidden size={14} /> : nextStatus === 'visible' ? <Eye aria-hidden size={14} /> : <EyeOff aria-hidden size={14} />}
          {action.label}
        </button>
      </article>
    })}
  </div>
}
