'use client'

import { ChangeEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Download, ImagePlus, Instagram, Share2, Sparkles, Trophy } from 'lucide-react'
import { track } from '@vercel/analytics'

type Player = {
  name: string
  position: string
  team: string
  province: string
  imageUrl: string | null
  isVerified: boolean
  isRanked: boolean
  stats: { ovr: number; pac: number; sho: number; pas: number; dri: number; def: number }
}

type Theme = 'gold' | 'red' | 'ice'
type Format = 'story' | 'feed'

const themeLabel: Record<Theme, string> = { gold: 'CHAMPION GOLD', red: 'BALLDOENSAI RED', ice: 'ICE BLUE' }

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function themeColors(theme: Theme) {
  if (theme === 'red') return { top: '#f5202b', bottom: '#4d0714', accent: '#ffd14b', ink: '#ffffff' }
  if (theme === 'ice') return { top: '#dff4ff', bottom: '#24699d', accent: '#07182c', ink: '#07182c' }
  return { top: '#f8d958', bottom: '#8b4c04', accent: '#fff0a3', ink: '#111827' }
}

export default function PlayerCardBuilder({ player, publicProfilePath }: { player: Player; publicProfilePath: string | null }) {
  const [theme, setTheme] = useState<Theme>('gold')
  const [format, setFormat] = useState<Format>('story')
  const [localImage, setLocalImage] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const imageUrl = localImage || player.imageUrl

  useEffect(() => () => { if (localImage) URL.revokeObjectURL(localImage) }, [localImage])

  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setStatus('กรุณาเลือกรูปภาพ JPG, PNG หรือ WEBP'); return }
    if (file.size > 8 * 1024 * 1024) { setStatus('รูปต้องมีขนาดไม่เกิน 8MB'); return }
    if (localImage) URL.revokeObjectURL(localImage)
    setLocalImage(URL.createObjectURL(file))
    setStatus('ใช้รูปนี้กับการ์ดเรียบร้อย — รูปจะอยู่เฉพาะตอนสร้างการ์ดครั้งนี้')
  }

  const makeCard = async () => {
    const width = 1080
    const height = format === 'story' ? 1920 : 1350
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not supported')
    const colors = themeColors(theme)
    const bg = ctx.createLinearGradient(0, 0, width, height)
    bg.addColorStop(0, '#07111f'); bg.addColorStop(0.55, colors.bottom); bg.addColorStop(1, '#05080f')
    ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height)
    ctx.globalAlpha = .16; ctx.strokeStyle = colors.accent; ctx.lineWidth = 3
    for (let x = -height; x < width; x += 110) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + height, height); ctx.stroke() }
    ctx.globalAlpha = 1

    const cardW = 820, cardH = 1130, cardX = (width - cardW) / 2, cardY = format === 'story' ? 330 : 110
    const card = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH)
    card.addColorStop(0, colors.top); card.addColorStop(.46, colors.bottom); card.addColorStop(1, '#111827')
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 48; ctx.fillStyle = card
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 42); ctx.fill(); ctx.shadowBlur = 0
    ctx.lineWidth = 7; ctx.strokeStyle = colors.accent; ctx.stroke()

    if (imageUrl) {
      try {
        const image = await loadImage(imageUrl)
        ctx.save(); ctx.beginPath(); ctx.roundRect(cardX + 48, cardY + 145, cardW - 96, 530, 24); ctx.clip()
        const scale = Math.max((cardW - 96) / image.width, 530 / image.height)
        const drawW = image.width * scale, drawH = image.height * scale
        ctx.drawImage(image, cardX + 48 + ((cardW - 96) - drawW) / 2, cardY + 145 + (530 - drawH) / 2, drawW, drawH)
        const fade = ctx.createLinearGradient(0, cardY + 450, 0, cardY + 690); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,.76)')
        ctx.fillStyle = fade; ctx.fillRect(cardX + 48, cardY + 145, cardW - 96, 530); ctx.restore()
      } catch { /* Public profile photo is optional; the card still exports cleanly. */ }
    }
    ctx.textAlign = 'left'; ctx.fillStyle = colors.ink; ctx.font = '900 126px Impact, sans-serif'; ctx.fillText(String(player.stats.ovr), cardX + 58, cardY + 120)
    ctx.font = '800 42px Arial, sans-serif'; ctx.fillText(player.position, cardX + 64, cardY + 172)
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '900 54px Arial, sans-serif'; ctx.fillText(player.name.toUpperCase(), width / 2, cardY + 758)
    ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.font = '600 29px Arial, sans-serif'; ctx.fillText(`${player.team} · ${player.province}`, width / 2, cardY + 805)
    const stats: Array<[string, number]> = [['PAC', player.stats.pac], ['SHO', player.stats.sho], ['PAS', player.stats.pas], ['DRI', player.stats.dri], ['DEF', player.stats.def]]
    stats.forEach(([key, value], index) => { const x = cardX + 105 + index * 153; ctx.fillStyle = '#fff'; ctx.font = '900 42px Impact, Arial'; ctx.fillText(String(value), x, cardY + 950); ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.font = '700 21px Arial'; ctx.fillText(key, x, cardY + 992) })
    ctx.fillStyle = 'rgba(0,0,0,.68)'; ctx.fillRect(cardX, cardY + cardH - 70, cardW, 70); ctx.fillStyle = '#fff'; ctx.font = '800 22px Arial'; ctx.fillText('BALLDOENSAI.COM · YOUR GAME, YOUR STORY', width / 2, cardY + cardH - 27)
    if (format === 'story') { ctx.fillStyle = '#fff'; ctx.font = '900 44px Impact, Arial'; ctx.fillText('MY PLAYER CARD', width / 2, 175); ctx.fillStyle = colors.accent; ctx.font = '700 25px Arial'; ctx.fillText('BALLDOENSAI.COM', width / 2, 220) }
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create image')), 'image/png'))
  }

  const download = async () => {
    try {
      setStatus('กำลังสร้างไฟล์ภาพ…')
      const blob = await makeCard(); const url = URL.createObjectURL(blob); const a = document.createElement('a')
      a.href = url; a.download = `balldoensai-${player.name.toLowerCase().replace(/\s+/g, '-')}-card.png`; a.click(); URL.revokeObjectURL(url)
      track('player_card_downloaded', { format, theme, has_photo: Boolean(imageUrl), rating: player.isRanked ? 'ranked' : 'starter' })
      setStatus('ดาวน์โหลดการ์ดแล้ว พร้อมโพสต์ได้เลย!')
    } catch { setStatus('สร้างภาพไม่สำเร็จ ลองเลือกรูปอื่นหรือดาวน์โหลดอีกครั้ง') }
  }

  const share = async () => {
    try {
      setStatus('กำลังเตรียมการ์ดสำหรับแชร์…')
      const blob = await makeCard(); const file = new File([blob], 'balldoensai-player-card.png', { type: 'image/png' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'My BallDoenSai Player Card', text: 'นี่คือ Player Card ของฉันจาก BallDoenSai.com ⚽', url: publicProfilePath ? `${window.location.origin}${publicProfilePath}` : undefined, files: [file] })
        track('player_card_shared', { format, theme, has_photo: Boolean(imageUrl), rating: player.isRanked ? 'ranked' : 'starter' })
        setStatus('เปิดเมนูแชร์แล้ว เลือก Instagram, Facebook หรือ TikTok ได้เลย')
      } else {
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'balldoensai-player-card.png'; a.click(); URL.revokeObjectURL(url)
        track('player_card_downloaded', { format, theme, has_photo: Boolean(imageUrl), rating: player.isRanked ? 'ranked' : 'starter' })
        setStatus('ดาวน์โหลดภาพแล้ว — เปิดแอปที่ต้องการ แล้วเลือกภาพนี้เพื่อโพสต์')
      }
    } catch (error) { if ((error as Error).name !== 'AbortError') setStatus('ยังแชร์ไม่สำเร็จ ลองกดดาวน์โหลด แล้วโพสต์จากแอปได้เลย') }
  }

  return <section className="card-builder">
    <div className="card-builder-copy">
      <p className="card-eyebrow"><Sparkles size={15} /> YOUR GAME · YOUR STORY</p>
      <h1>สร้างการ์ด<br /><em>นักเตะของคุณ</em></h1>
      <p>ใส่รูป เลือกดีไซน์ แล้วเซฟเป็นภาพสำหรับ Story, TikTok หรือ Facebook ได้ทันที</p>
      {!player.isRanked && <div className="card-starter-note"><Trophy size={16} /><span><b>STARTER CARD</b> · ค่าสถานะเริ่มต้นจะเปลี่ยนเป็น Rating จริงหลังมีผลงานในระบบ</span></div>}
      <div className="card-builder-controls">
        <span>ดีไซน์การ์ด</span><div className="card-theme-options">{(['gold', 'red', 'ice'] as Theme[]).map(item => <button key={item} onClick={() => setTheme(item)} className={`card-theme-option is-${item} ${theme === item ? 'is-selected' : ''}`} aria-label={themeLabel[item]}><i /> {themeLabel[item]}</button>)}</div>
        <span>ขนาดไฟล์</span><div className="card-format-options"><button onClick={() => setFormat('story')} className={format === 'story' ? 'is-selected' : ''}>9:16 <small>Story / TikTok</small></button><button onClick={() => setFormat('feed')} className={format === 'feed' ? 'is-selected' : ''}>4:5 <small>Instagram Feed</small></button></div>
        <input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={choosePhoto} />
        <button className="card-photo-button" onClick={() => inputRef.current?.click()}><ImagePlus size={18} /> {imageUrl ? 'เปลี่ยนรูปในการ์ด' : 'เลือกรูปของฉัน'}</button>
        <p className="card-photo-help">รูปนี้ใช้สร้างการ์ดเท่านั้น · ต้องการบันทึกลงโปรไฟล์? <Link href="/profile">ไปที่โปรไฟล์</Link></p>
      </div>
    </div>
    <div className="card-builder-preview">
      <div className={`player-card-poster is-${format}`}><div className={`player-card is-${theme}`}>
        <div className="player-card-glint" /><div className="player-card-rating"><b>{player.stats.ovr}</b><span>{player.position}</span></div>
        <div className="player-card-photo" style={imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined}><div className="player-card-photo-fallback">{player.position}</div></div>
        <div className="player-card-detail"><h2>{player.name}</h2>{player.isVerified && <CheckCircle2 size={17} />}<p>{player.team} · {player.province}</p><div>{Object.entries(player.stats).filter(([key]) => key !== 'ovr').map(([key, value]) => <span key={key}><b>{value}</b><small>{key.toUpperCase()}</small></span>)}</div></div>
        <footer>BALLDOENSAI.COM · YOUR GAME, YOUR STORY</footer>
      </div></div>
      <div className="card-share-actions"><button onClick={download}><Download size={19} /> ดาวน์โหลด PNG</button><button className="card-share-primary" onClick={share}><Share2 size={19} /> แชร์การ์ด</button></div>
      <p className="card-share-note"><Instagram size={15} /> บนมือถือ ปุ่ม “แชร์การ์ด” จะเปิดรายชื่อแอปที่ติดตั้งในเครื่อง{publicProfilePath ? ' พร้อมลิงก์ Athlete Profile' : ''}</p>
      {status && <p className="card-status" role="status">{status}</p>}
    </div>
  </section>
}
