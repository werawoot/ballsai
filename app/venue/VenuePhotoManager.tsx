'use client'

import { useState } from 'react'
import { ImagePlus, Star, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import VenuePitchCover from '@/components/VenuePitchCover'
import {
  moderationBadge,
  movePhoto,
  ownerPhotoRows,
  type OwnerPhotoRow,
} from '@/lib/venue-photo-manager'
import {
  VENUE_PHOTO_ACCEPT,
  VENUE_PHOTO_LIMIT,
  buildVenuePhotoPath,
  validateVenuePhotoFile,
} from '@/lib/venue-photo-upload'
import { createClient } from '@/lib/supabase'

type Feedback = { tone: 'success' | 'error'; text: string }

// Re-encodes to WebP in the browser. SQL43 only accepts a `.webp` object path, and the
// re-encode also drops the camera EXIF block, which can carry GPS coordinates.
async function toWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('เบราว์เซอร์นี้ไม่รองรับการแปลงรูป')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('แปลงรูปไม่สำเร็จ')), 'image/webp', 0.86))
}

export default function VenuePhotoManager({ venueId, venueName, photos }: {
  venueId: string
  venueName: string
  photos: OwnerPhotoRow[]
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const rows = ownerPhotoRows(photos)

  const refresh = () => window.location.reload()

  const call = async (key: string, path: string, method: string, body?: unknown) => {
    setBusy(key); setFeedback(null)
    const response = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null)
    const data = response ? await response.json().catch(() => null) as { error?: string } | null : null
    setBusy(null)
    if (!response || !response.ok) {
      setFeedback({ tone: 'error', text: data?.error ?? 'ดำเนินการไม่สำเร็จ' })
      return false
    }
    return true
  }

  const upload = async (file: File) => {
    const check = validateVenuePhotoFile(file, photos.length)
    if (!check.ok) { setFeedback({ tone: 'error', text: check.error }); return }

    setBusy('upload'); setFeedback(null)
    const objectPath = buildVenuePhotoPath(venueId)
    try {
      const blob = await toWebp(file)
      // Uploads go straight to the private bucket under the anon session: storage RLS
      // from SQL43 is what authorises them. No service role is ever used here.
      const supabase = createClient()
      const { error: uploadError } = await supabase.storage
        .from('venue-photos')
        .upload(objectPath, blob, { contentType: 'image/webp', upsert: false })
      if (uploadError) throw new Error('อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่')

      const registered = await call('upload', `/api/venues/${venueId}/photos`, 'POST', { objectPath })
      if (!registered) {
        // The row was never created, so the orphan object must not stay behind.
        await supabase.storage.from('venue-photos').remove([objectPath])
        return
      }
      setFeedback({ tone: 'success', text: 'อัปโหลดแล้ว รอทีมงานตรวจก่อนแสดงต่อผู้เล่น' })
      refresh()
    } catch (error) {
      setBusy(null)
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'อัปโหลดไม่สำเร็จ' })
    }
  }

  const setCover = async (photoId: string) => {
    if (await call(photoId, `/api/venues/${venueId}/photos/${photoId}`, 'PATCH', {})) {
      setFeedback({ tone: 'success', text: 'ตั้งเป็นรูปปกแล้ว' }); refresh()
    }
  }

  const move = async (photoId: string, direction: 'up' | 'down') => {
    const photoIds = movePhoto(rows, photoId, direction)
    if (!photoIds) return
    if (await call(photoId, `/api/venues/${venueId}/photos`, 'PATCH', { photoIds })) {
      setFeedback({ tone: 'success', text: 'เรียงลำดับรูปใหม่แล้ว' }); refresh()
    }
  }

  const remove = async (photoId: string) => {
    if (!window.confirm('ลบรูปนี้ใช่ไหม? การลบย้อนกลับไม่ได้')) return
    if (await call(photoId, `/api/venues/${venueId}/photos/${photoId}`, 'DELETE')) {
      setFeedback({ tone: 'success', text: 'ลบรูปแล้ว' }); refresh()
    }
  }

  const btn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #e0e4e8',
    borderRadius: 8, background: '#fff', padding: '6px 9px', fontSize: 11, fontWeight: 800,
    cursor: busy ? 'wait' : 'pointer', ...extra,
  })

  return <div style={{ display: 'grid', gap: 11 }}>
    {feedback && <p role="status" aria-live="polite" style={{ margin: 0, padding: '9px 11px', borderRadius: 9, background: feedback.tone === 'error' ? '#fff1f1' : '#ecfdf5', color: feedback.tone === 'error' ? '#b91c1c' : '#166534', fontSize: 12, fontWeight: 700 }}>{feedback.text}</p>}

    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: '#697586', fontWeight: 700 }}>รูปสนาม {photos.length}/{VENUE_PHOTO_LIMIT}</span>
      <label style={{ ...btn({ background: '#CC0001', color: '#fff', border: 0, opacity: photos.length >= VENUE_PHOTO_LIMIT ? 0.5 : 1 }) }}>
        <ImagePlus size={14} /> {busy === 'upload' ? 'กำลังอัปโหลด...' : 'เพิ่มรูป'}
        <input
          type="file"
          accept={VENUE_PHOTO_ACCEPT}
          disabled={busy !== null || photos.length >= VENUE_PHOTO_LIMIT}
          onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file) }}
          style={{ display: 'none' }}
        />
      </label>
    </div>

    {rows.length === 0
      ? <VenuePitchCover height={110} label="ยังไม่มีรูปสนาม เพิ่มรูปแรกได้เลย" />
      : <div style={{ display: 'grid', gap: 9 }}>{rows.map(photo => {
        const badge = moderationBadge(photo.moderation_status)
        return <article key={photo.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', background: '#fff', border: '1px solid #e4e7eb', borderRadius: 10, padding: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 78, height: 56, borderRadius: 7, overflow: 'hidden', background: '#0b2620', flex: '0 0 auto' }}>
            {/* The thumbnail stays a drawn placeholder: serving the real private
                object needs signed-image delivery, which is a separate change. */}
            <VenuePitchCover height={56} label="" />
          </div>
          <div style={{ minWidth: 0, flex: '1 1 160px' }}>
            <span style={{ display: 'inline-block', borderRadius: 20, padding: '3px 8px', fontSize: 10, fontWeight: 900, background: badge.background, color: badge.color }}>{badge.label}</span>
            {photo.is_cover && <span style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 3, borderRadius: 20, padding: '3px 8px', fontSize: 10, fontWeight: 900, background: '#fff7ed', color: '#9a3412' }}><Star size={10} /> รูปปก</span>}
            <p style={{ margin: '6px 0 0', color: '#697586', fontSize: 11, lineHeight: 1.5 }}>{badge.hint}</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy !== null || !photo.canMoveUp} onClick={() => void move(photo.id, 'up')} aria-label={`เลื่อนรูปขึ้น ${venueName}`} style={btn()}><ChevronUp size={13} /></button>
            <button type="button" disabled={busy !== null || !photo.canMoveDown} onClick={() => void move(photo.id, 'down')} aria-label={`เลื่อนรูปลง ${venueName}`} style={btn()}><ChevronDown size={13} /></button>
            {photo.canSetCover && <button type="button" disabled={busy !== null} onClick={() => void setCover(photo.id)} style={btn()}><Star size={13} /> ตั้งเป็นปก</button>}
            <button type="button" disabled={busy !== null} onClick={() => void remove(photo.id)} aria-label="ลบรูปนี้" style={btn({ border: '1px solid #fecaca', color: '#b91c1c' })}><Trash2 size={13} /> ลบ</button>
          </div>
        </article>
      })}</div>}
  </div>
}
