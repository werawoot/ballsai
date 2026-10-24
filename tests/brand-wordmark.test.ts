import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import BrandWordmark, { SPORT_WORDS } from '@/components/BrandWordmark'

// Owner, 24 Oct 2026: the word before DOENSAI.com slides down through four sports, all in
// English (Ball, Basket, Run, Futsal), on /login and the home page.
describe('the moving wordmark', () => {
  const html = renderToStaticMarkup(createElement(BrandWordmark))

  it('rolls through Ball, Basket, Run and Futsal before DOENSAI.com', () => {
    expect(SPORT_WORDS).toEqual(['Ball', 'Basket', 'Run', 'Futsal'])
    for (const word of SPORT_WORDS) expect(html).toContain(`>${word}<`)
    expect(html).toMatch(/DOENSAI<em>\.com<\/em>/)
  })

  it('is read once as DOENSAI.com: the moving words are hidden from screen readers', () => {
    expect(html).toMatch(/class="bw-roll" aria-hidden="true"/)
  })

  it('staggers each word so one shows at a time, and stands still for reduced motion', () => {
    expect(html).toContain('--bw-i:3')
    const css = readFileSync('app/brand-wordmark.css', 'utf8')
    expect(css).toMatch(/@keyframes bw-drop/)
    expect(css).toMatch(/prefers-reduced-motion: reduce[^}]*\{[^}]*\.bw-roll span[^{]*\{[^}]*animation: none/)
  })

  it('stops after three loops and rests on Ball, so it does not move beside the form for good', () => {
    const css = readFileSync('app/brand-wordmark.css', 'utf8')
    expect(css).toMatch(/\.bw-roll span \{[^}]*bw-drop 8s [^;]* 3 both/)
    // Three 8 s loops end at 24 s; then the first word drops back in and stays.
    expect(css).toMatch(/\.bw-roll span:first-child \{[^}]*bw-rest [^;]*24s forwards/)
  })

  it('stands on /login and the home page', () => {
    expect(readFileSync('app/login/LoginPanel.tsx', 'utf8')).toContain('<BrandWordmark')
    expect(readFileSync('app/page.tsx', 'utf8')).toContain('<BrandWordmark')
  })
})
