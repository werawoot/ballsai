import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// T62 (owner, 21 Nov 2026: "ปิด prefetch ลิงก์เมนู"). Next.js strips its prefetch headers before
// middleware runs (next/dist/server/web/adapter.js, FLIGHT_HEADERS), so middleware cannot tell a
// prefetch from a visit and asks Supabase Auth on every one. A prefetch of these dynamic pages
// carries no data (scripts/e2e/request-count.mjs: db=0), only that Auth call. The bottom bar and the
// page header are on every page, so their links do not prefetch.

const root = fileURLToPath(new URL('../', import.meta.url))
const links = (path: string) => readFileSync(`${root}${path}`, 'utf8').match(/<Link\b[\s\S]*?>/g) ?? []

describe('links on every page do not prefetch', () => {
  for (const path of ['components/SiteNav.tsx', 'components/PageHeader.tsx']) {
    it(`${path}: every Link says prefetch={false}`, () => {
      const found = links(path)
      expect(found.length).toBeGreaterThan(0)
      for (const link of found) expect(link).toContain('prefetch={false}')
    })
  }
})
