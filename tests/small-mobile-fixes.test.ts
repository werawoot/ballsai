import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { podiumNameLines } from '@/lib/podium-name'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8')

describe('/ranking podium names on a 320px phone', () => {
  it('puts the first name and the rest on their own lines', () => {
    expect(podiumNameLines('ณัฐวุฒิ ศรีสนาม')).toEqual(['ณัฐวุฒิ', 'ศรีสนาม'])
    expect(podiumNameLines('  Somchai   Jai Dee ')).toEqual(['Somchai', 'Jai Dee'])
    expect(podiumNameLines('ธีรภัทร')).toEqual(['ธีรภัทร'])
  })

  it('never cuts the name off: no ellipsis, and a part too wide still wraps', () => {
    const page = read('app/ranking/page.tsx')
    const name = page.slice(page.indexOf('podiumNameLines(p.player_name)') - 400, page.indexOf('podiumNameLines(p.player_name)'))
    const style = name.slice(name.lastIndexOf('<div style={{'))
    expect(style).not.toMatch(/textOverflow|whiteSpace: 'nowrap'/)
    expect(style).toContain("overflowWrap: 'anywhere'")
  })
})

describe('/card header on a narrow phone', () => {
  const css = read('app/globals.css')
  const narrow = css.slice(css.indexOf('@media (max-width:419px) {\n  .card-page-header'))

  it('moves the two links to their own row instead of breaking them inside their pills', () => {
    expect(narrow).toContain('.card-page-header { flex-wrap:wrap;')
    expect(narrow).toContain('.card-page-header > div { margin-left:auto; }')
    expect(narrow).toContain('.card-page-profile-link { white-space:nowrap; }')
  })
})
