import { Camera, ImageOff } from 'lucide-react'

// A drawn football pitch, not a photograph. Pure inline SVG and CSS: no external URL,
// no stock image, nothing fetched. Used wherever a venue has no usable photo, so the
// empty state still reads as a Thai pitch rather than a blank grey box.
export default function VenuePitchCover({ height, reason = 'no-photos', label }: {
  height: number | string
  reason?: 'no-photos' | 'all-broken'
  label?: string
}) {
  const Icon = reason === 'all-broken' ? ImageOff : Camera
  const text = label ?? (reason === 'all-broken' ? 'โหลดภาพสนามไม่ได้' : 'ยังไม่มีภาพสนาม')

  return <div
    role="img"
    aria-label={text}
    style={{
      position: 'relative',
      height,
      background: 'radial-gradient(120% 90% at 50% 0%, #17563f 0%, #0f3b2c 45%, #0b2620 100%)',
      overflow: 'hidden',
      display: 'grid',
      placeItems: 'center',
    }}
  >
    {/* mown-grass banding */}
    <div aria-hidden="true" style={{
      position: 'absolute',
      inset: 0,
      backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 8%, transparent 8% 16%)',
    }} />
    {/* pitch markings */}
    <svg aria-hidden="true" viewBox="0 0 300 180" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5 }}>
      <g fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.4">
        <rect x="10" y="10" width="280" height="160" />
        <line x1="150" y1="10" x2="150" y2="170" />
        <circle cx="150" cy="90" r="30" />
        <rect x="10" y="50" width="34" height="80" />
        <rect x="256" y="50" width="34" height="80" />
      </g>
      <circle cx="150" cy="90" r="3" fill="rgba(255,255,255,.65)" />
    </svg>
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(16,24,39,0) 40%, rgba(16,24,39,.72) 100%)' }} />
    <span aria-hidden="true" style={{
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      padding: '7px 12px',
      borderRadius: 999,
      background: 'rgba(11,26,22,.72)',
      border: '1px solid rgba(245,197,24,.35)',
      color: '#f5c518',
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: 0.3,
    }}><Icon size={14} /> {text}</span>
  </div>
}
