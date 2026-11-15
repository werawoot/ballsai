import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// A form submitted before React has hydrated is sent by the browser itself. Without a method that
// is a GET to the same page, and every named field (an email, a phone number, a note about an
// athlete) lands in the URL: browser history, server logs, the Referer header (docs/e2e.md,
// 15 Nov 2026). A form handled by onSubmit therefore says method="post", or has its own action.

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? sources(path) : /\.tsx$/.test(name) ? [path] : []
  })
}

describe('forms handled by onSubmit', () => {
  it('never fall back to a GET that puts the fields in the URL', () => {
    const offenders: string[] = []
    for (const file of [...sources('app'), ...sources('components')]) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/<form\b[^>]*>/g)) {
        const tag = match[0]
        if (/onSubmit=/.test(tag) && !/\baction=/.test(tag) && !/method="post"/i.test(tag)) {
          offenders.push(`${file}:${text.slice(0, match.index).split('\n').length}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
