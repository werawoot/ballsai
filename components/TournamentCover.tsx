import Image from 'next/image'
import { MapPin } from 'lucide-react'
import { tournamentCover, type TournamentCoverSource } from '@/lib/tournament-cover'

// The top of a tournament card. See lib/tournament-cover.ts for why it is a graphic and
// where a real venue photo would plug in. The shapes are abstract on purpose: no pitch
// markings, no grass, nothing a parent could mistake for a picture of the actual venue.

export default function TournamentCover({ tournament }: { tournament: TournamentCoverSource }) {
  const cover = tournamentCover(tournament)
  return <div className={`bds-tcover is-${cover.kind}`} data-cover={cover.kind}>
    {cover.kind === 'photo'
      // Same delivery as the venue gallery: the photo URL is already the served size.
      ? <Image className="bds-tcover-photo" src={cover.src} alt={cover.venue ? `สนาม ${cover.venue}` : 'สนามแข่ง'} fill sizes="(max-width: 720px) 100vw, 720px" unoptimized />
      : <span className="bds-tcover-art" aria-hidden="true"><i /><i /><i /></span>}
    <div className="bds-tcover-top">
      {cover.status && <span className={`bds-tcover-status${cover.status.open ? ' is-open' : ''}`}>{cover.status.label}</span>}
      {cover.sport && <span className="bds-tcover-sport">{cover.sport}</span>}
    </div>
    {cover.venue && <p className="bds-tcover-venue"><MapPin size={14} aria-hidden="true" /><span>{cover.venue}</span></p>}
  </div>
}
