'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { ImageOff, ImagePlus, Loader2, Star, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
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
import { VENUE_PENDING_COPY, pendingButton, shouldStartAction } from '@/lib/pending-action'
import {
  nextPreviewState,
  previewAltText,
  schedulePreviewRefresh,
  shouldFetchPreview,
  type PreviewState,
} from '@/lib/venue-photo-preview'

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
  const [pending, setPending] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({})
  // Bumped by the expiry timer. It is a dependency of the fetch effect below, which is
  // what actually makes an expired preview reload.
  const [previewTick, setPreviewTick] = useState(0)
  const rows = ownerPhotoRows(photos)
  const add = pendingButton({
    pending,
    key: 'upload',
    ...VENUE_PENDING_COPY.upload,
    disabled: photos.length >= VENUE_PHOTO_LIMIT,
  })

  // Signed URLs are minted per photo and never stored. They are short-lived, so the
  // effect refetches once one lapses while the page stays open.
  const loadPreview = useCallback(async (photoId: string) => {
    setPreviews(current => ({ ...current, [photoId]: { status: 'loading' } }))
    const response = await fetch(`/api/venues/${venueId}/photos/${photoId}/preview`).catch(() => null)
    const data = response ? await response.json().catch(() => null) as { url?: string; expiresIn?: number; error?: string } | null : null
    const state = response?.ok && data?.url && data.expiresIn
      ? nextPreviewState({ ok: true, url: data.url, expiresIn: data.expiresIn }, Date.now())
      : nextPreviewState({ ok: false, error: data?.error }, Date.now())
    setPreviews(current => ({ ...current, [photoId]: state }))
  }, [venueId])

  useEffect(() => {
    const now = Date.now()
    for (const photo of photos) {
      if (shouldFetchPreview(previews[photo.id], now)) void loadPreview(photo.id)
    }
  }, [photos, previews, loadPreview, previewTick])

  // shouldFetchPreview alone never runs again once every preview is ready, because
  // nothing re-renders at expiresAt. Arm a timer for the soonest expiry; bumping the
  // tick re-runs the effect above, which is what performs the refetch. Re-armed
  // whenever previews change and cleared on unmount.
  useEffect(() => schedulePreviewRefresh(previews, () => setPreviewTick(tick => tick + 1)), [previews])

  const refresh = () => window.location.reload()

  const call = async (key: string, path: string, method: string, body?: unknown) => {
    setPending(key); setFeedback(null)
    const response = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null)
    const data = response ? await response.json().catch(() => null) as { error?: string } | null : null
    setPending(null)
    if (!response || !response.ok) {
      setFeedback({ tone: 'error', text: data?.error ?? 'ดำเนินการไม่สำเร็จ' })
      return false
    }
    return true
  }

  const upload = async (file: File) => {
    // disabled locks the file input on render; this refuses a change event that
    // arrives while a previous upload is still running.
    if (!shouldStartAction(pending)) return
    const check = validateVenuePhotoFile(file, photos.length)
    if (!check.ok) { setFeedback({ tone: 'error', text: check.error }); return }

    setPending('upload'); setFeedback(null)
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
      setPending(null)
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'อัปโหลดไม่สำเร็จ' })
    }
  }

  const setCover = async (photoId: string) => {
    if (!shouldStartAction(pending)) return
    if (await call(photoId, `/api/venues/${venueId}/photos/${photoId}`, 'PATCH', {})) {
      setFeedback({ tone: 'success', text: 'ตั้งเป็นรูปปกแล้ว' }); refresh()
    }
  }

  const move = async (photoId: string, direction: 'up' | 'down') => {
    if (!shouldStartAction(pending)) return
    const photoIds = movePhoto(rows, photoId, direction)
    if (!photoIds) return
    if (await call(photoId, `/api/venues/${venueId}/photos`, 'PATCH', { photoIds })) {
      setFeedback({ tone: 'success', text: 'เรียงลำดับรูปใหม่แล้ว' }); refresh()
    }
  }

  const remove = async (photoId: string) => {
    if (!shouldStartAction(pending)) return
    if (!window.confirm('ลบรูปนี้ใช่ไหม? การลบย้อนกลับไม่ได้')) return
    if (await call(photoId, `/api/venues/${venueId}/photos/${photoId}`, 'DELETE')) {
      setFeedback({ tone: 'success', text: 'ลบรูปแล้ว' }); refresh()
    }
  }

  const btn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #e0e4e8',
    borderRadius: 8, background: '#fff', padding: '6px 9px', fontSize: 11, fontWeight: 800,
    // Each caller passes the cursor its own pending state implies, so this is only
    // the idle default.
    cursor: 'pointer', ...extra,
  })

  return <div style={{ display: 'grid', gap: 11 }}>
    {feedback && <p role="status" aria-live="polite" style={{ margin: 0, padding: '9px 11px', borderRadius: 9, background: feedback.tone === 'error' ? '#fff1f1' : '#ecfdf5', color: feedback.tone === 'error' ? '#b91c1c' : '#166534', fontSize: 12, fontWeight: 700 }}>{feedback.text}</p>}

    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: '#697586', fontWeight: 700 }}>รูปสนาม {photos.length}/{VENUE_PHOTO_LIMIT}</span>
      <label aria-busy={add['aria-busy']} style={{ ...btn({ background: '#CC0001', color: '#fff', border: 0, opacity: add.disabled ? 0.5 : 1, cursor: add.disabled ? 'not-allowed' : 'pointer' }) }}>
        <ImagePlus aria-hidden size={14} /> {add.label}
        <input
          type="file"
          accept={VENUE_PHOTO_ACCEPT}
          disabled={add.disabled}
          onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file) }}
          style={{ display: 'none' }}
        />
      </label>
    </div>

    {rows.length === 0
      ? <VenuePitchCover height={110} label="ยังไม่มีรูปสนาม เพิ่มรูปแรกได้เลย" />
      : <div style={{ display: 'grid', gap: 9 }}>{rows.map((photo, index) => {
        const badge = moderationBadge(photo.moderation_status)
        const preview = previews[photo.id]
        // All four buttons share the photo id as their pending key, so whichever one the
        // owner pressed is the one that reads as busy.
        const busyFor = (copy: { idle: string; busy: string }, disabled = false) =>
          pendingButton({ pending, key: photo.id, ...copy, disabled })
        const up = busyFor(VENUE_PENDING_COPY.move, !photo.canMoveUp)
        const down = busyFor(VENUE_PENDING_COPY.move, !photo.canMoveDown)
        const cover = busyFor(VENUE_PENDING_COPY.cover)
        const del = busyFor(VENUE_PENDING_COPY.remove)
        return <article key={photo.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', background: '#fff', border: '1px solid #e4e7eb', borderRadius: 10, padding: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 78, height: 56, borderRadius: 7, overflow: 'hidden', background: '#0b2620', flex: '0 0 auto', display: 'grid', placeItems: 'center' }}>
            {preview?.status === 'ready'
              ? <Image src={preview.url} alt={previewAltText(venueName, index, photo.is_cover)} fill sizes="78px" style={{ objectFit: 'cover' }} unoptimized onError={() => setPreviews(current => ({ ...current, [photo.id]: { status: 'error', message: 'โหลดรูปไม่สำเร็จ' } }))} />
              : preview?.status === 'error'
                ? <span role="img" aria-label={`โหลดรูปไม่สำเร็จ: ${preview.message}`} style={{ display: 'grid', placeItems: 'center', color: '#fecaca' }}><ImageOff size={18} /></span>
                : <span role="status" aria-label={`กำลังโหลด${previewAltText(venueName, index, photo.is_cover)}`} style={{ display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.6)' }}><Loader2 size={18} /></span>}
          </div>
          <div style={{ minWidth: 0, flex: '1 1 160px' }}>
            <span style={{ display: 'inline-block', borderRadius: 20, padding: '3px 8px', fontSize: 10, fontWeight: 900, background: badge.background, color: badge.color }}>{badge.label}</span>
            {photo.is_cover && <span style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 3, borderRadius: 20, padding: '3px 8px', fontSize: 10, fontWeight: 900, background: '#fff7ed', color: '#9a3412' }}><Star size={10} /> รูปปก</span>}
            <p style={{ margin: '6px 0 0', color: '#697586', fontSize: 11, lineHeight: 1.5 }}>{badge.hint}</p>
            {preview?.status === 'error' && <p style={{ margin: '4px 0 0', color: '#b91c1c', fontSize: 11 }}>{preview.message}</p>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {/* These two are icon-only, so their accessible name is the aria-label and
                that is what has to change while the reorder is in flight. */}
            <button type="button" aria-busy={up['aria-busy']} disabled={up.disabled} onClick={() => void move(photo.id, 'up')} aria-label={up.isPending ? up.label : `เลื่อนรูปขึ้น ${venueName}`} style={btn({ cursor: up.disabled ? 'not-allowed' : 'pointer' })}><ChevronUp aria-hidden size={13} /></button>
            <button type="button" aria-busy={down['aria-busy']} disabled={down.disabled} onClick={() => void move(photo.id, 'down')} aria-label={down.isPending ? down.label : `เลื่อนรูปลง ${venueName}`} style={btn({ cursor: down.disabled ? 'not-allowed' : 'pointer' })}><ChevronDown aria-hidden size={13} /></button>
            {photo.canSetCover && <button type="button" aria-busy={cover['aria-busy']} disabled={cover.disabled} onClick={() => void setCover(photo.id)} style={btn({ cursor: cover.disabled ? 'not-allowed' : 'pointer' })}><Star aria-hidden size={13} /> {cover.label}</button>}
            <button type="button" aria-busy={del['aria-busy']} disabled={del.disabled} onClick={() => void remove(photo.id)} aria-label={del.isPending ? del.label : 'ลบรูปนี้'} style={btn({ border: '1px solid #fecaca', color: '#b91c1c', cursor: del.disabled ? 'not-allowed' : 'pointer' })}><Trash2 aria-hidden size={13} /> {del.label}</button>
          </div>
        </article>
      })}</div>}
  </div>
}
