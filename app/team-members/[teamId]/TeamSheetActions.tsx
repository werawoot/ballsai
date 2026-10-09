'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Image as ImageIcon, Printer } from 'lucide-react'
import type { TeamSheetRow } from '@/lib/team-stats'

// The team sheet as a picture (drawn on a canvas, saved as PNG, nothing uploaded) or as a
// PDF through the browser's own print dialog (team-page.css prints only the sheet).
export default function TeamSheetActions({ teamName, tournamentName, rows }: { teamName: string; tournamentName: string | null; rows: TeamSheetRow[] }) {
  const t = useTranslations('teamPage')
  const [failed, setFailed] = useState(false)

  const saveImage = () => {
    try {
      const width = 1080, pad = 72, line = 64, top = tournamentName ? 250 : 200
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = top + rows.length * line + 140
      const context = canvas.getContext('2d')
      if (!context) throw new Error('no canvas')
      const family = getComputedStyle(document.body).fontFamily || 'sans-serif'
      context.fillStyle = '#f6f3ee'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#cc0001'
      context.fillRect(0, 0, width, 14)
      context.fillStyle = '#111827'
      context.font = `800 56px ${family}`
      context.fillText(teamName, pad, 120)
      if (tournamentName) { context.fillStyle = '#5b6472'; context.font = `500 32px ${family}`; context.fillText(tournamentName, pad, 175) }
      rows.forEach((row, index) => {
        const y = top + index * line
        context.fillStyle = '#e3ddd3'
        context.fillRect(pad, y - 44, width - pad * 2, 2)
        context.fillStyle = '#5b6472'
        context.font = `700 32px ${family}`
        context.fillText(String(row.no), pad, y)
        context.fillStyle = '#111827'
        context.font = `600 36px ${family}`
        context.fillText(row.name, pad + 80, y)
        context.fillStyle = '#5b6472'
        context.font = `700 30px ${family}`
        context.textAlign = 'right'
        context.fillText(row.position ?? '—', width - pad, y)
        context.textAlign = 'left'
      })
      context.fillStyle = '#5b6472'
      context.font = `500 26px ${family}`
      context.fillText('BallDoenSai.com', pad, canvas.height - 56)
      const link = document.createElement('a')
      link.download = `${teamName.replace(/[\\/:*?"<>|]+/g, '-')}.png`
      link.href = canvas.toDataURL('image/png')
      // Some browsers ignore the file name of a link that is not in the page.
      document.body.appendChild(link)
      link.click()
      link.remove()
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  return (
    <div className="tp-actions">
      <button type="button" className="ui-btn ui-btn-primary" onClick={saveImage}><ImageIcon size={17} aria-hidden="true" />{t('saveImage')}</button>
      <button type="button" className="ui-btn ui-btn-ghost" onClick={() => window.print()}><Printer size={17} aria-hidden="true" />{t('savePdf')}</button>
      {failed && <p className="tp-alert" role="alert">{t('imageFailed')}</p>}
    </div>
  )
}
