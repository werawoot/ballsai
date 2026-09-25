'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import VenuePitchCover from '@/components/VenuePitchCover'
import { activeVenuePhoto, venueImageView, venuePhotoAlt } from '@/lib/venue-images'
import {
  publicPhotoViewPath,
  resolvedGalleryPhotos,
  type ListedPhoto,
  type ResolvedUrls,
} from '@/lib/venue-photo-public'

// The venue's approved photos live in a private bucket, so this component never receives
// a URL. It gets ids the server has already filtered down to moderation-approved photos
// and asks the view route for one short-lived signed URL each. A photo whose request is
// refused is simply left out, and a venue with nothing showable falls through to the
// drawn pitch cover exactly as before.
export default function VenueGallery({
  venueName,
  venueId,
  photos,
}: {
  venueName: string
  venueId?: string
  photos?: ListedPhoto[] | null
}) {
  const listed = photos ?? []
  const [urls, setUrls] = useState<ResolvedUrls>({})
  const [failedIds, setFailedIds] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const pending = Boolean(venueId) && listed.length > 0 && listed.some(photo => !(photo.id in urls))

  useEffect(() => {
    if (!venueId) return
    let cancelled = false

    // Reads the prop, not the array rebuilt on every render, so the effect re-runs only
    // when the photo list or a resolved url actually changes.
    for (const photo of photos ?? []) {
      if (photo.id in urls) continue
      void fetch(publicPhotoViewPath(venueId, photo.id))
        .then(response => (response.ok ? response.json() as Promise<{ url?: string }> : null))
        .catch(() => null)
        .then(data => {
          // null marks a refusal, which resolvedGalleryPhotos drops. Recording it stops
          // the effect asking again for a photo the route will keep refusing.
          if (!cancelled) setUrls(current => ({ ...current, [photo.id]: data?.url ?? null }))
        })
    }

    return () => { cancelled = true }
  }, [venueId, photos, urls])

  const view = venueImageView(resolvedGalleryPhotos(listed, urls), failedIds)

  if (view.kind === 'placeholder') {
    return pending
      ? <div role="status" aria-label={`กำลังโหลดภาพสนาม ${venueName}`}>
          <VenuePitchCover height="clamp(190px,42vw,320px)" label="" />
        </div>
      : <VenuePitchCover height="clamp(190px,42vw,320px)" reason={view.reason} />
  }

  const active = activeVenuePhoto(view, activeId)
  const markFailed = (id: string) => setFailedIds(current => current.includes(id) ? current : [...current, id])

  return <div>
    <div style={{ position: 'relative', height: 'clamp(190px,42vw,320px)', background: '#0b2620', overflow: 'hidden' }}>
      <Image
        src={active.photo.url}
        alt={venuePhotoAlt(venueName, active.index, active.photo.alt)}
        fill
        sizes="(max-width: 880px) 100vw, 880px"
        style={{ objectFit: 'cover' }}
        // A signed URL is short-lived, so it must not be run through the image
        // optimizer's cache.
        unoptimized
        onError={() => markFailed(active.photo.id)}
        priority
      />
    </div>
    {view.gallery.length > 0 && <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 0 2px', scrollbarWidth: 'thin' }}>
      {[view.cover, ...view.gallery].map((item, index) => <button
        key={item.id}
        type="button"
        onClick={() => setActiveId(item.id)}
        aria-label={`ดู${venuePhotoAlt(venueName, index, item.alt)}`}
        aria-current={item.id === active.photo.id}
        style={{ position: 'relative', flex: '0 0 auto', width: 92, height: 62, borderRadius: 8, overflow: 'hidden', border: item.id === active.photo.id ? '2px solid #f5c518' : '1px solid rgba(255,255,255,.18)', background: '#0b2620', padding: 0, cursor: 'pointer' }}
      >
        {/* The button's aria-label is the accessible name, so this image is
            decorative: an alt here would make the photo be announced twice. */}
        <Image
          src={item.url}
          alt=""
          fill
          sizes="92px"
          style={{ objectFit: 'cover' }}
          unoptimized
          onError={() => markFailed(item.id)}
        />
      </button>)}
    </div>}
  </div>
}
