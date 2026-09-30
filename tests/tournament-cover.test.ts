import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  tournamentCover,
  tournamentCoverPhoto,
  tournamentCoverSport,
  tournamentCoverStatus,
} from '@/lib/tournament-cover'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8')

describe('what a tournament card cover shows', () => {
  it('is a graphic built from the row, never a photo, for every tournament today', () => {
    const cover = tournamentCover({ location: 'สนามกีฬาเฉลิมพระเกียรติ อยุธยา', status: 'open' })
    expect(cover).toEqual({
      kind: 'graphic',
      venue: 'สนามกีฬาเฉลิมพระเกียรติ อยุธยา',
      sport: null,
      status: 'open',
    })
    // The one switch: nothing may produce a picture until tournaments link to venues.
    expect(tournamentCoverPhoto({ location: 'any', status: 'open', sport: 'football' })).toBeNull()
  })

  it('says a closed tournament is closed, instead of the old hard-coded "open" on every card', () => {
    expect(tournamentCoverStatus('closed')).toBe('closed')
    expect(tournamentCover({ location: 'x', status: 'closed' }).status).toBe('closed')
  })

  it('claims nothing for a status the API does not write', () => {
    for (const status of [null, undefined, '', 'draft', 'OPEN']) {
      expect(tournamentCoverStatus(status)).toBeNull()
    }
  })

  it('shows a sport only when the row carries a known one', () => {
    expect(tournamentCoverSport('football')).toBe('football')
    expect(tournamentCoverSport(' futsal ')).toBe('futsal')
    for (const sport of [undefined, null, '', '  ', 'chess', 42]) {
      expect(tournamentCoverSport(sport)).toBeNull()
    }
  })

  it('leaves the venue out rather than printing a blank one', () => {
    expect(tournamentCover({ location: '   ', status: 'open' }).venue).toBeNull()
    expect(tournamentCover({ status: 'open' }).venue).toBeNull()
  })
})

describe('the tournament pages read status, sport and photo only through the seam', () => {
  const list = read('app/tournaments/page.tsx')
  const detail = read('app/tournaments/[id]/page.tsx')

  it('words the status from the row on every card, never a fixed "open"', () => {
    expect(list).toContain('tournamentCoverStatus(item.status)')
    expect(list).not.toMatch(/^\s*เปิดรับสมัคร\s*$/m)
  })

  it('shows no picture on the list, and on the detail only the photo the seam returns', () => {
    expect(list).not.toMatch(/<Image\b|<img\b|VenuePitchCover/)
    expect(detail).toContain("heading.kind === 'photo'")
    expect(detail.match(/<Image\b/g)?.length).toBe(1)
    expect(detail).not.toMatch(/<img\b|VenuePitchCover/)
  })
})
