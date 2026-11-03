import { IDENTITY_BADGES, type IdentityBadgeKey } from './digital-identity'

// The card collection on /card (owner, 3 Nov 2026: "ได้จากผลงานจริงเท่านั้น"). Every card
// version is earned by something recorded: a badge, which only verified match results and the
// athlete's own profile write (digital-identity-v1), or a season the athlete holds a rank row
// for. Nothing is drawn at random, bought or traded. The rarity of each version is a fixed
// rule published on the page, so anyone can see why a card is rare. Free of React and of the
// database, so the rules can be tested directly.

export const RARITIES = ['common', 'rare', 'special', 'legend'] as const
export type Rarity = (typeof RARITIES)[number]

export type CollectionItem =
  | { kind: 'badge'; badge: IdentityBadgeKey; rarity: Rarity }
  | { kind: 'season'; rarity: Rarity }

// A first of anything is rare; a match's best player and ten matches are special; a Power
// Rating of 1,500 is legend. Creating a profile and holding a season's rank are common.
const BADGE_RARITY: Record<IdentityBadgeKey, Rarity> = {
  rookie: 'common',
  first_match: 'rare',
  first_win: 'rare',
  goal_hunter: 'rare',
  playmaker: 'rare',
  clean_sheet: 'rare',
  match_mvp: 'special',
  road_warrior: 'special',
  rising_star: 'legend',
}

export const COLLECTION: readonly CollectionItem[] = [
  ...IDENTITY_BADGES.map(badge => ({ kind: 'badge' as const, badge: badge.key, rarity: BADGE_RARITY[badge.key] })),
  { kind: 'season', rarity: 'common' },
]

export type CollectionCard = { id: string; rarity: Rarity; kind: 'badge' | 'season'; badge?: IdentityBadgeKey; season?: string; earnedAt: string | null }
export type CollectionView = { earned: CollectionCard[]; locked: CollectionCard[]; counts: Record<Rarity | 'all', number> }

const rank = (rarity: Rarity) => RARITIES.indexOf(rarity)
// Rarest first; within a rarity the newest first (a season card has no date and leads its rarity).
const order = (a: CollectionCard, b: CollectionCard) =>
  rank(b.rarity) - rank(a.rarity) || (b.earnedAt ?? '9999').localeCompare(a.earnedAt ?? '9999') || b.id.localeCompare(a.id)

export function collectionView({ badges, seasons }: { badges: { badge_key: string; awarded_at: string | null }[]; seasons: string[] }): CollectionView {
  const earnedBadges = new Map(badges.map(row => [row.badge_key, row.awarded_at]))
  const earned: CollectionCard[] = []
  const locked: CollectionCard[] = []
  for (const item of COLLECTION) {
    if (item.kind === 'badge') {
      const card: CollectionCard = { id: `badge:${item.badge}`, kind: 'badge', badge: item.badge, rarity: item.rarity, earnedAt: earnedBadges.get(item.badge) ?? null }
      ;(earnedBadges.has(item.badge) ? earned : locked).push(card)
    } else if (seasons.length > 0) {
      for (const season of new Set(seasons)) earned.push({ id: `season:${season}`, kind: 'season', season, rarity: item.rarity, earnedAt: null })
    } else {
      locked.push({ id: 'season:next', kind: 'season', rarity: item.rarity, earnedAt: null })
    }
  }
  earned.sort(order)
  locked.sort((a, b) => rank(a.rarity) - rank(b.rarity) || a.id.localeCompare(b.id))
  const counts = { all: earned.length, common: 0, rare: 0, special: 0, legend: 0 }
  for (const card of earned) counts[card.rarity]++
  return { earned, locked, counts }
}

export type CardTab = 'mine' | 'collection' | 'special'
export const CARD_TABS: readonly CardTab[] = ['mine', 'collection', 'special']
export const parseCardTab = (value: string | string[] | undefined): CardTab => {
  const raw = Array.isArray(value) ? value[0] : value
  return CARD_TABS.includes(raw as CardTab) ? raw as CardTab : 'mine'
}
