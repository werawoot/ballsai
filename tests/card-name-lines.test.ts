import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cardNameLines } from '@/lib/card-name'

// The name on a Player Card (screen and shared image) goes on one line when it fits and on
// two balanced lines when it does not, never cut with "…" (UX mockup v5-C).
describe('cardNameLines', () => {
  it('keeps a name that fits on one line', () => {
    expect(cardNameLines('SOMCHAI JAIDEE', true)).toEqual(['SOMCHAI JAIDEE'])
  })

  it('splits a long name at the space that balances the two lines', () => {
    expect(cardNameLines('SOMCHAI JAIDEE BANGKOK', false)).toEqual(['SOMCHAI JAIDEE', 'BANGKOK'])
    expect(cardNameLines('A BBBBBBBB CCCCCCCC', false)).toEqual(['A BBBBBBBB', 'CCCCCCCC'])
  })

  it('splits Thai given name and family name at their space', () => {
    expect(cardNameLines('น้องกลับมา ฟุตบอลเยาวชน', false)).toEqual(['น้องกลับมา', 'ฟุตบอลเยาวชน'])
  })

  it('leaves a single long word on one line, to be made smaller', () => {
    expect(cardNameLines('ABCDEFGHIJKLMNOPQRSTUVWXYZ', false)).toEqual(['ABCDEFGHIJKLMNOPQRSTUVWXYZ'])
  })

  it('ignores extra spaces', () => {
    expect(cardNameLines('  AA   BB  ', false)).toEqual(['AA', 'BB'])
    expect(cardNameLines('  AA   BB  ', true)).toEqual(['AA BB'])
  })
})

describe('the name on the card screen', () => {
  const css = readFileSync(new URL('../app/card/card.css', import.meta.url), 'utf8')
  const rule = css.match(/^\.pc-name \{[^}]*\}/m)?.[0] ?? ''
  it('gets smaller first when it is long, as the shared image does', () => {
    expect(css).toMatch(/\.pc-name\.is-long \{[^}]*font-size/)
    expect(readFileSync(new URL('../app/card/PlayerCardBuilder.tsx', import.meta.url), 'utf8')).toMatch(/is-long/)
  })

  it('is not cut with an ellipsis and may take two lines', () => {
    expect(rule).not.toBe('')
    expect(rule).not.toMatch(/text-overflow:\s*ellipsis/)
    expect(rule).not.toMatch(/white-space:\s*nowrap/)
    expect(rule).toMatch(/-webkit-line-clamp:\s*2/)
  })
})
