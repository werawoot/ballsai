import { skillEntries, skillText } from '@/lib/skill-ratings'
import type { PlayerCardStats } from '@/lib/player-card'

// Draws the Player Card as a shareable PNG: Story 1080×1920 or Feed 1080×1350. The layout
// follows the card on screen (app/card/card.css); sizes are the on-screen card's (360×540)
// scaled up. Every number goes through skillText, so an empty one is a dash, never a default.

export type CardTheme = 'red' | 'gold' | 'ice'
export type CardFormat = 'story' | 'feed'

export type ExportCard = {
  theme: CardTheme
  format: CardFormat
  name: string
  position: string
  meta: string
  imageUrl: string | null
  stats: PlayerCardStats
  isRanked: boolean
  power: number | null
  chip: string
  chipTone: 'ok' | 'coach' | 'self'
  unlock: string
  starterLabel: string
  season: string
}

export const CARD_GRADIENTS: Record<CardTheme, [number, string][]> = {
  red: [[0, '#3a0003'], [0.38, '#8f0003'], [0.62, '#CC0001'], [1, '#2a0002']],
  gold: [[0, '#2b1d05'], [0.4, '#8a6112'], [0.64, '#e7b54a'], [1, '#3a2807']],
  ice: [[0, '#06172a'], [0.42, '#1d5a86'], [0.66, '#8fcaf2'], [1, '#0a2034']],
}

const CHIP_COLORS = { ok: 'rgba(20,160,90,.92)', coach: 'rgba(40,110,220,.9)', self: 'rgba(255,255,255,.16)' }

function fontStack(variable: string, fallback: string) {
  const value = typeof document === 'undefined' ? '' : getComputedStyle(document.body).getPropertyValue(variable).trim()
  const thai = typeof document === 'undefined' ? '' : getComputedStyle(document.body).getPropertyValue('--font-sarabun').trim()
  return [value, thai, fallback].filter(Boolean).join(', ')
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: (size: number) => string, size: number, min: number) {
  let current = size
  ctx.font = font(current)
  while (current > min && ctx.measureText(text).width > maxWidth) { current -= 2; ctx.font = font(current) }
  return current
}

async function drawCard(ctx: CanvasRenderingContext2D, card: ExportCard, x: number, y: number, w: number) {
  const s = w / 360
  const h = 540 * s
  const display = fontStack('--font-oswald', 'Impact, sans-serif')
  const label = fontStack('--font-barlow', 'Arial, sans-serif')
  const body = fontStack('--font-sarabun', 'sans-serif')

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 60 * s; ctx.shadowOffsetY = 26 * s
  const bg = ctx.createLinearGradient(x, y, x + w * 0.55, y + h)
  for (const [stop, color] of CARD_GRADIENTS[card.theme]) bg.addColorStop(stop, color)
  ctx.fillStyle = bg
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 26 * s); ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 26 * s); ctx.clip()
  ctx.globalAlpha = 0.06; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * s
  for (let offset = -h; offset < w + h; offset += 20 * s) { ctx.beginPath(); ctx.moveTo(x + offset, y); ctx.lineTo(x + offset - h * 0.62, y + h); ctx.stroke() }
  ctx.globalAlpha = 1

  const photoH = h * 0.7
  if (card.imageUrl) {
    try {
      const image = await loadImage(card.imageUrl)
      const scale = Math.max(w / image.width, photoH / image.height)
      const drawW = image.width * scale, drawH = image.height * scale
      ctx.drawImage(image, x + (w - drawW) / 2, y + Math.min(0, (photoH - drawH) * 0.2), drawW, drawH)
    } catch { /* The photo is optional; the card still exports cleanly. */ }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.textAlign = 'center'
    ctx.font = `800 ${190 * s}px ${display}`; ctx.fillText(card.position, x + w * 0.6, y + photoH * 0.62)
  }
  // Darken the top (rating stays readable on a bright photo) and the bottom (name, numbers).
  const fade = ctx.createLinearGradient(0, y, 0, y + photoH)
  fade.addColorStop(0, 'rgba(0,0,0,.42)'); fade.addColorStop(0.3, 'rgba(0,0,0,0)'); fade.addColorStop(0.42, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,.78)')
  ctx.fillStyle = fade; ctx.fillRect(x, y, w, photoH)
  ctx.fillStyle = 'rgba(0,0,0,.78)'; ctx.fillRect(x, y + photoH, w, h - photoH)
  // A light sheen across the card, as on screen.
  const sheen = ctx.createLinearGradient(x, y, x + w, y + h)
  sheen.addColorStop(0.3, 'rgba(255,255,255,0)'); sheen.addColorStop(0.45, 'rgba(255,255,255,.14)'); sheen.addColorStop(0.62, 'rgba(255,255,255,0)')
  ctx.fillStyle = sheen; ctx.fillRect(x, y, w, h)

  // Top left: rating and position. Top right: the brand mark.
  ctx.textAlign = 'left'; ctx.fillStyle = '#fff'
  ctx.font = `800 ${(card.stats.ovr === null ? 50 : 80) * s}px ${display}`; ctx.fillText(skillText(card.stats.ovr), x + 18 * s, y + 82 * s)
  ctx.font = `700 ${15 * s}px ${label}`; ctx.fillText(card.position, x + 20 * s, y + 104 * s)
  ctx.globalAlpha = 0.75; ctx.font = `700 ${9.5 * s}px ${label}`
  ctx.fillText(card.isRanked && card.power !== null ? `POWER ${card.power.toLocaleString('en-US')}` : card.starterLabel, x + 20 * s, y + 121 * s)
  ctx.globalAlpha = 1
  ctx.save(); ctx.translate(x + w - 48 * s, y + 18 * s); ctx.transform(1, 0, -0.18, 1, 0, 0)
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 30 * s, 30 * s)
  ctx.fillStyle = card.theme === 'gold' ? '#8a6112' : card.theme === 'ice' ? '#1d5a86' : '#CC0001'
  ctx.textAlign = 'center'; ctx.font = `800 ${16 * s}px ${display}`; ctx.fillText('B', 15 * s, 22 * s)
  ctx.restore()

  // Bottom: provenance chip, name, team line, numbers or the unlock line, footer.
  const left = x + 18 * s, right = x + w - 18 * s
  let cursor = y + h - 16 * s
  ctx.textAlign = 'left'; ctx.globalAlpha = 0.62; ctx.fillStyle = '#fff'; ctx.font = `700 ${8.5 * s}px ${label}`
  ctx.fillText('BALLDOENSAI.COM', left, cursor)
  ctx.textAlign = 'right'; ctx.fillText(`SEASON ${card.season}`, right, cursor)
  ctx.globalAlpha = 1
  cursor -= 20 * s

  if (card.isRanked) {
    const entries = skillEntries(card.stats)
    const column = (w - 36 * s) / entries.length
    entries.forEach(([key, value], index) => {
      const cx = left + column * index + column / 2
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff'
      ctx.globalAlpha = 0.7; ctx.font = `700 ${9 * s}px ${label}`; ctx.fillText(key, cx, cursor)
      ctx.globalAlpha = 1; ctx.font = `800 ${25 * s}px ${display}`; ctx.fillText(skillText(value), cx, cursor - 15 * s)
    })
    cursor -= 48 * s
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1 * s
    ctx.beginPath(); ctx.moveTo(left, cursor); ctx.lineTo(right, cursor); ctx.stroke()
    cursor -= 12 * s
  } else {
    const boxH = 40 * s
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1 * s
    ctx.beginPath(); ctx.roundRect(left, cursor - boxH, right - left, boxH, 12 * s); ctx.fill(); ctx.stroke()
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'
    fitText(ctx, card.unlock, right - left - 24 * s, size => `700 ${size}px ${body}`, 12.5 * s, 8 * s)
    ctx.fillText(card.unlock, left + 12 * s, cursor - boxH / 2 + 5 * s)
    cursor -= boxH + 14 * s
  }

  ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.8)'
  fitText(ctx, card.meta, right - left, size => `500 ${size}px ${body}`, 13 * s, 9 * s)
  if (card.meta) ctx.fillText(card.meta, left, cursor)
  cursor -= 20 * s
  ctx.fillStyle = '#fff'
  const name = card.name.toUpperCase()
  fitText(ctx, name, right - left, size => `800 ${size}px ${display}`, 42 * s, 20 * s)
  ctx.fillText(name, left, cursor)
  cursor -= 50 * s

  ctx.font = `700 ${11 * s}px ${body}`
  const chipW = ctx.measureText(card.chip).width + 22 * s, chipH = 22 * s
  ctx.fillStyle = CHIP_COLORS[card.chipTone]
  ctx.beginPath(); ctx.roundRect(left, cursor - chipH, chipW, chipH, chipH / 2); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.fillText(card.chip, left + 11 * s, cursor - 7 * s)
  ctx.restore()
  return h
}

export async function renderCardImage(card: ExportCard) {
  if (typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready
  const width = 1080
  const height = card.format === 'story' ? 1920 : 1350
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not supported')

  ctx.fillStyle = '#07090d'; ctx.fillRect(0, 0, width, height)
  const glow = ctx.createRadialGradient(width / 2, height * 0.45, 0, width / 2, height * 0.45, width * 0.75)
  glow.addColorStop(0, card.theme === 'gold' ? 'rgba(231,181,74,.34)' : card.theme === 'ice' ? 'rgba(143,202,242,.3)' : 'rgba(204,0,1,.42)')
  glow.addColorStop(1, 'rgba(7,9,13,0)')
  ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height)

  const display = fontStack('--font-oswald', 'Impact, sans-serif')
  const label = fontStack('--font-barlow', 'Arial, sans-serif')
  if (card.format === 'story') {
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `800 64px ${display}`; ctx.fillText('MY PLAYER CARD', width / 2, 205)
    ctx.fillStyle = 'rgba(255,255,255,.62)'; ctx.font = `700 26px ${label}`; ctx.fillText('BALLDOENSAI.COM · YOUR GAME, YOUR STORY', width / 2, 252)
    const cardW = 840
    const cardH = await drawCard(ctx, card, (width - cardW) / 2, 330, cardW)
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = `700 24px ${label}`; ctx.textAlign = 'center'
    ctx.fillText('VERIFIED FOOTBALL IDENTITY · THAILAND', width / 2, 330 + cardH + 110)
  } else {
    const cardW = 760
    await drawCard(ctx, card, (width - cardW) / 2, 105, cardW)
  }
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create image')), 'image/png'))
}
