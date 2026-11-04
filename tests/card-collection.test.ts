import { describe, expect, it } from 'vitest'
import { COLLECTION, RARITIES, collectionView, parseCardTab } from '@/lib/card-collection'
import { IDENTITY_BADGES } from '@/lib/digital-identity'

// The card collection (owner, 3 Nov 2026: "ได้จากผลงานจริงเท่านั้น"): every card version is
// earned by something recorded, never drawn at random and never bought. A version is a badge
// (written by verified match results, digital-identity-v1) or a season the athlete holds a rank
// row for. The rarity of each is a fixed published rule, shown on the page.

describe('the collection rules', () => {
  it('has one version for every badge, plus the season card', () => {
    for (const badge of IDENTITY_BADGES) expect(COLLECTION.some(item => item.badge === badge.key), badge.key).toBe(true)
    expect(COLLECTION.some(item => item.kind === 'season')).toBe(true)
  })

  it('gives every version one of the four rarities, rarest last', () => {
    expect(RARITIES).toEqual(['common', 'rare', 'special', 'legend'])
    for (const item of COLLECTION) expect(RARITIES).toContain(item.rarity)
    expect(COLLECTION.find(item => item.badge === 'rising_star')?.rarity).toBe('legend')
    expect(COLLECTION.find(item => item.badge === 'rookie')?.rarity).toBe('common')
  })
})

describe('an athlete\'s collection', () => {
  const view = collectionView({
    badges: [{ badge_key: 'rookie', awarded_at: '2026-09-01T00:00:00Z' }, { badge_key: 'first_match', awarded_at: '2026-10-05T00:00:00Z' }, { badge_key: 'match_mvp', awarded_at: '2026-10-12T00:00:00Z' }],
    seasons: ['2026'],
  })

  it('marks what was earned, with when, and keeps the rest as goals', () => {
    expect(view.earned.map(item => item.id)).toEqual(['badge:match_mvp', 'badge:first_match', 'season:2026', 'badge:rookie'])
    expect(view.earned.find(item => item.id === 'badge:first_match')?.earnedAt).toBe('2026-10-05T00:00:00Z')
    expect(view.locked.some(item => item.id === 'badge:rising_star')).toBe(true)
    expect(view.locked.some(item => item.id === 'badge:first_match')).toBe(false)
  })

  it('counts earned cards by rarity', () => {
    expect(view.counts).toEqual({ all: 4, common: 2, rare: 1, special: 1, legend: 0 })
  })

  it('makes one season card per season held, newest first', () => {
    const two = collectionView({ badges: [], seasons: ['2025', '2026'] })
    expect(two.earned.map(item => item.id)).toEqual(['season:2026', 'season:2025'])
  })

  it('ignores a badge it does not know', () => {
    expect(collectionView({ badges: [{ badge_key: 'made_up', awarded_at: '2026-10-01T00:00:00Z' }], seasons: [] }).earned).toEqual([])
  })

  it('is empty for a new athlete, with every version still to earn', () => {
    const fresh = collectionView({ badges: [], seasons: [] })
    expect(fresh.earned).toEqual([])
    expect(fresh.counts.all).toBe(0)
    expect(fresh.locked.length).toBe(COLLECTION.filter(item => item.kind === 'badge').length + 1)
  })
})

describe('the tab /card opens on', () => {
  it('follows the address and falls back to my card', () => {
    expect(parseCardTab('collection')).toBe('collection')
    expect(parseCardTab('special')).toBe('special')
    expect(parseCardTab(undefined)).toBe('mine')
    expect(parseCardTab('x')).toBe('mine')
  })
})
