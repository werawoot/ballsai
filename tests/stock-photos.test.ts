import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BACKDROP, COVER_DETAILS, coverDetailFor, LOGIN_ART, PAGE_PHOTOS, PROGRAM_PHOTOS, SPORT_TILES, STADIUM, type StockPhoto } from '@/lib/stock-photos'
import { TRAINING_PROGRAMS } from '@/lib/training/content'

const root = fileURLToPath(new URL('../', import.meta.url))
const credits = readFileSync(`${root}docs/photo-credits.md`, 'utf8')

describe('licensed stock photos', () => {
  const all: StockPhoto[] = [...(STADIUM ? [STADIUM] : []), ...(BACKDROP ? [BACKDROP] : []), ...COVER_DETAILS, ...Object.values(PAGE_PHOTOS), LOGIN_ART, ...Object.values(SPORT_TILES), ...Object.values(PROGRAM_PHOTOS)]

  it('every photo listed is a file in public/photos with a row in docs/photo-credits.md', () => {
    for (const photo of all) {
      expect(photo.src.startsWith('/photos/'), photo.src).toBe(true)
      expect(existsSync(`${root}public${photo.src}`), photo.src).toBe(true)
      const file = photo.src.slice('/photos/'.length)
      expect(credits, `${file} needs a credits row`).toMatch(new RegExp(`\\|\\s*\`?${file.replace('.', '\\.')}\`?\\s*\\|`))
      expect(photo.credit.length).toBeGreaterThan(0)
    }
  })

  // Owner, 22 Oct 2026: no photo used twice. Each page head is its own photo, different
  // from the home page's and from every card cover.
  it('gives every page its own head photo, used nowhere else', () => {
    const heads = [STADIUM?.src, ...Object.values(PAGE_PHOTOS).map(photo => photo.src)]
    expect(new Set(heads).size).toBe(heads.length)
    for (const cover of COVER_DETAILS) expect(heads).not.toContain(cover.src)
  })

  it('gives a tournament the same cover detail every time, and none while the set is empty', () => {
    const set: StockPhoto[] = [{ src: '/photos/a.webp', credit: 'a' }, { src: '/photos/b.webp', credit: 'b' }, { src: '/photos/c.webp', credit: 'c' }]
    expect(coverDetailFor('t-1', set)).toBe(coverDetailFor('t-1', set))
    expect(new Set(['t-1', 't-2', 't-3', 't-4', 't-5', 't-6'].map(id => coverDetailFor(id, set)?.src)).size).toBeGreaterThan(1)
    expect(coverDetailFor('t-1', [])).toBeNull()
  })
})

// Owner, 24 Oct 2026: the programme cards on /training show a real photo: an adult player whose
// face is not shown, or the pitch, never a brand;
// the drills keep their 3D pictures, which show the movement exactly.
describe('programme photos', () => {
  it('give every training programme its own real photo', () => {
    for (const program of TRAINING_PROGRAMS) expect(PROGRAM_PHOTOS[program.id], program.id).toBeTruthy()
    const files = Object.values(PROGRAM_PHOTOS).map(photo => photo.src)
    expect(new Set(files).size).toBe(files.length)
  })

  it('stand on /training cards, with the 3D picture only as a fallback', () => {
    expect(readFileSync(`${root}app/training/page.tsx`, 'utf8')).toMatch(/PROGRAM_PHOTOS\[program\.id\]\?\.src \?\? drillImage\(program\.cover\)/)
  })
})
