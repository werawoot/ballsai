import { describe, expect, it } from 'vitest'
import th from '@/messages/th.json'
import en from '@/messages/en.json'
import { MAX_NAV_ITEMS, NAV_ITEMS, activeNavItem, navItemsFor } from '@/lib/site-nav'

// Owner, 9 Oct 2026 (approved mockup "BallDoenSai ตัวอย่าง UX ตามบทบาท"): the bottom bar
// belongs to the person's role, and its first tab is their main job.
const ids = (kind: Parameters<typeof navItemsFor>[0]) => navItemsFor(kind).map(item => item.id)

describe('a bottom bar per role', () => {
  it('opens on each role\'s main job', () => {
    expect(ids('athlete')).toEqual(['training', 'card', 'team', 'notifications', 'profile'])
    expect(ids('guardian')).toEqual(['kids', 'tournaments', 'notifications', 'profile'])
    expect(ids('coach')).toEqual(['team', 'plan', 'tournaments', 'notifications', 'profile'])
    expect(ids('organizer')).toEqual(['manage', 'results', 'tournaments', 'notifications', 'profile'])
  })

  it('keeps the general bar for signed-out visitors, venues and sponsors', () => {
    for (const kind of [null, 'venue', 'sponsor'] as const) expect(navItemsFor(kind)).toBe(NAV_ITEMS)
  })

  it('stays within five tabs, never repeats one, and always keeps notifications and profile', () => {
    for (const kind of ['athlete', 'guardian', 'coach', 'organizer'] as const) {
      const items = navItemsFor(kind)
      expect(items.length).toBeLessThanOrEqual(MAX_NAV_ITEMS)
      expect(new Set(items.map(item => item.href)).size).toBe(items.length)
      expect(ids(kind)).toContain('notifications')
      expect(ids(kind)).toContain('profile')
    }
  })

  it('lights the right tab inside a role bar', () => {
    expect(activeNavItem('/training/u14-game-skills-01', navItemsFor('athlete'))).toBe('training')
    expect(activeNavItem('/career', navItemsFor('athlete'))).toBe('card')
    expect(activeNavItem('/team-members', navItemsFor('athlete'))).toBe('team')
    expect(activeNavItem('/profile/edit', navItemsFor('athlete'))).toBe('profile')
    expect(activeNavItem('/guardian', navItemsFor('guardian'))).toBe('kids')
    expect(activeNavItem('/match-plan', navItemsFor('coach'))).toBe('plan')
    expect(activeNavItem('/dashboard', navItemsFor('organizer'))).toBe('manage')
    expect(activeNavItem('/dashboard/tournaments/abc/fixtures', navItemsFor('organizer'))).toBe('manage')
    expect(activeNavItem('/dashboard/results', navItemsFor('organizer'))).toBe('results')
    // A page no tab owns lights none, as in the general bar.
    expect(activeNavItem('/terms', navItemsFor('coach'))).toBeNull()
  })

  it('names every tab in Thai and English', () => {
    for (const kind of ['athlete', 'guardian', 'coach', 'organizer'] as const) {
      for (const item of navItemsFor(kind)) {
        expect((th.nav.items as Record<string, string>)[item.id], item.id).toMatch(/[฀-๿]/)
        expect((en.nav.items as Record<string, string>)[item.id], item.id).toBeTruthy()
      }
    }
  })
})
