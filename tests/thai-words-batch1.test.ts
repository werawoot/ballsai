import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Owner decision "คำ ก", 8 Oct 2026: every label on the site is Thai in Thai; only the brand
// BallDoenSai, position codes (GK/DF/MF/FW) and outside brand names stay as they are. The home
// page waits for a UX mockup (AGENTS.md rule 7). Batch 1 is what athletes and parents see.
// Text lives in messages/*.json, so these files hold neither Thai nor English words in JSX.
// KEEP: the brand and its logo marks (B, BALLDOENSAI.COM), share-button icon letters (IG, TT, f),
// OTP, position codes, age classes (U12...) and outside brand names.
const BATCH_1 = ['app/career/page.tsx', 'app/hall-of-fame/page.tsx', 'app/athletes/page.tsx', 'app/players/[id]/page.tsx', 'app/card/PlayerCardBuilder.tsx', 'app/card/page.tsx', 'app/training/page.tsx', 'app/training/[programId]/page.tsx', 'app/tournaments/page.tsx', 'app/tournaments/[id]/page.tsx', 'app/ranking/page.tsx', 'app/welcome/OnboardingFlow.tsx']
const KEEP = /^(BallDoenSai(\.com)?|BALLDOENSAI(\.COM)?|B|IG|TT|f|OTP|BDS|GK|DF|MF|FW|U\d+|YouTube|TikTok|Google|LINE|Facebook|Instagram)$/

// English words in JSX text, brand names and codes in KEEP left out.
const jsxWords = (source: string) => [...source.matchAll(/>([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g)]
  .map(match => match[1].trim())
  .filter(text => text && !/[=;()]|=>|&&/.test(text))
  .flatMap(text => (text.match(/[A-Za-z][A-Za-z.]*[A-Za-z]|[A-Za-z]/g) ?? []).filter(word => !KEEP.test(word)))

// Files that keep legal consent wording in Thai in the code: the owner's rule is that consent
// text is never reworded or translated by the team, so only their English labels are checked.
const CONSENT_FILES = ['app/guardian/GuardianLinksClient.tsx', 'app/login/LoginPanel.tsx']

describe('batch 1 pages speak Thai from messages', () => {
  it.each(CONSENT_FILES)('%s has no English label in its code', file => {
    expect(jsxWords(readFileSync(file, 'utf8'))).toEqual([])
  })
  it.each(BATCH_1)('%s has no Thai and no English label in its code', file => {
    const source = readFileSync(file, 'utf8')
    expect(source.match(/[฀-๿]+/g) ?? []).toEqual([])
    expect(jsxWords(source)).toEqual([])
  })
})

// Batch 2: coach, organizer, venue, sponsor and scout pages. These files still hold older Thai
// text in code (they are on the Thai baseline); their English labels are now in messages.labels.
const BATCH_2 = ['app/scout/page.tsx', 'app/scout/ScoutClient.tsx', 'app/match-plan/page.tsx', 'app/match-plan/MatchPlanClient.tsx',
  'app/organization/page.tsx', 'app/organization/OrganizationClient.tsx', 'app/sponsor/page.tsx', 'app/sponsor/SponsorClient.tsx',
  'app/sponsorships/page.tsx', 'app/venue/VenueOperations.tsx', 'app/venues/BookingRequestClient.tsx',
  'app/bds-wallet/page.tsx', 'app/team-members/TeamMembersClient.tsx', 'app/dashboard/page.tsx']

describe('batch 2 pages have no English labels in code', () => {
  it.each(BATCH_2)('%s', file => {
    expect(jsxWords(readFileSync(file, 'utf8'))).toEqual([])
  })
})
