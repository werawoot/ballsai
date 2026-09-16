'use client'

import { useState } from 'react'
import Image from 'next/image'
import VenuePitchCover from '@/components/VenuePitchCover'
import { activeVenuePhoto, venueImageView, venuePhotoAlt, type VenuePhoto } from '@/lib/venue-images'

// Renders whatever photos the venue actually has. Today that list is always empty
// because no venue image column or bucket exists yet, so this falls through to the
// drawn pitch cover. The broken-image path is wired now so a future migration does not
// need to touch this component.
export default function VenueGallery({ venueName, photos }: { venueName: string; photos?: VenuePhoto[] | null }) {
  const [failedIds, setFailedIds] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const view = venueImageView(photos, failedIds)

  if (view.kind === 'placeholder') {
    return <VenuePitchCover height="clamp(190px,42vw,320px)" reason={view.reason} />
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
          onError={() => markFailed(item.id)}
        />
      </button>)}
    </div>}
  </div>
}
