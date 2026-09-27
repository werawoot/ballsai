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

describe('the cover on the tournaments page', () => {
  const page = read('app/tournaments/page.tsx')
  const component = read('components/TournamentCover.tsx')
  const css = read('app/globals.css')

  it('is drawn on every card from the row itself', () => {
    expect(page).toContain('<TournamentCover tournament={t} />')
  })

  it('no longer tells every card it is open', () => {
    expect(page).not.toMatch(/^\s*เปิดรับสมัคร\s*$/m)
  })

  it('renders a photo only through the one seam', () => {
    // A picture element may appear only on the photo branch, which only the seam reaches.
    expect(component).toContain("cover.kind === 'photo'")
    expect(component.match(/<Image\b/g)?.length).toBe(1)
    expect(component).not.toContain('<img')
    expect(page).not.toMatch(/<Image\b|<img\b|VenuePitchCover/)
  })

  it('keeps the graphic abstract: no drawn pitch, no image URL', () => {
    // VenuePitchCover draws a grass pitch with markings -- exactly what could pass for the venue.
    expect(component).not.toContain('VenuePitchCover')
    const rules = css.slice(css.indexOf('.bds-tcover {'), css.indexOf('@media (max-width:359px) { .bds-tcover-venue'))
    expect(rules).not.toMatch(/url\(/)
    expect(rules).not.toMatch(/#1[0-9a-f]5[0-9a-f]3f|green/i)
  })

  it('uses the brand red and gold', () => {
    const rule = css.slice(css.indexOf('.bds-tcover {'), css.indexOf('}', css.indexOf('.bds-tcover {')))
    expect(rule).toContain('--tc-red:#CC0001')
    expect(rule).toContain('--tc-gold:#f4b942')
  })

  it('wraps a long venue name instead of cutting it off', () => {
    const start = css.indexOf('\n.bds-tcover-venue {')
    const rule = css.slice(start, css.indexOf('}', start))
    expect(rule).toContain('overflow-wrap:anywhere')
    expect(rule).not.toMatch(/text-overflow|line-clamp|white-space:nowrap/)
  })
})
