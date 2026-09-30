'use client'

import { ChangeEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { CheckCircle2, Copy, Download, Facebook, ImagePlus, Instagram, Loader2, Music2, Save, Share2, Sparkles, Trophy } from 'lucide-react'
import { track } from '@vercel/analytics'
import { createClient } from '@/lib/supabase'
import { ACTIVE_SPORT } from '@/lib/season'
import { skillEntries, skillText } from '@/lib/skill-ratings'
import { AVATAR_BUCKET, avatarPath } from '@/lib/athlete-avatar'
import type { PlayerCardStats } from '@/lib/player-card'

type Player = {
  name: string
  position: string
  team: string
  province: string
  // A signed URL to show, and the stored object path (T51: the bucket is private).
  imageUrl: string | null
  imagePath: string | null
  isVerified: boolean
  isRanked: boolean
  // Skill ratings are null until a coach or admin assesses them (T32); shown as a dash.
  stats: PlayerCardStats
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

export default function PlayerCardBuilder({ player, publicProfilePath, userId }: { player: Player; publicProfilePath: string | null; userId: string }) {
  const router = useRouter()
  const t = useTranslations('card')
  const locale = useLocale()
  const [theme, setTheme] = useState<Theme>('gold')
  const [format, setFormat] = useState<Format>('story')
  const [localImage, setLocalImage] = useState<string | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
  const savedImage = player.imageUrl
  const [savedPath, setSavedPath] = useState<string | null>(player.imagePath)
  const [name, setName] = useState(player.name === 'YOUR NAME' ? '' : player.name)
  const [position, setPosition] = useState(player.position)
  const [team, setTeam] = useState(player.team === 'BALLDOENSAI ACADEMY' ? '' : player.team)
  const [province, setProvince] = useState(player.province === 'THAILAND' ? '' : player.province)
  const [savingProfile, setSavingProfile] = useState(false)
  const [status, setStatus] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const imageUrl = localImage || savedImage
  const cardPlayer = { ...player, name: name.trim() || 'YOUR NAME', position, team: team.trim() || 'BALLDOENSAI ACADEMY', province: province.trim() || 'THAILAND' }
  const cardFilename = `balldoensai-${cardPlayer.name.toLowerCase().replace(/\s+/g, '-')}-card.png`

  useEffect(() => () => { if (localImage) URL.revokeObjectURL(localImage) }, [localImage])

  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setStatus(t('chooseImage')); return }
    if (file.size > 8 * 1024 * 1024) { setStatus(t('imageTooLarge')); return }
    if (localImage) URL.revokeObjectURL(localImage)
    setSelectedPhoto(file)
    setLocalImage(URL.createObjectURL(file))
    setStatus(t('photoReady'))
  }

  const saveCardIdentity = async () => {
    if (!name.trim()) { setStatus(t('nameRequired')); return }
    setSavingProfile(true)
    setStatus(t('saving'))
    const supabase = createClient()
    let profileImagePath = savedPath
    let uploadedPath: string | null = null

    if (selectedPhoto) {
      const extension = selectedPhoto.type === 'image/png' ? 'png' : selectedPhoto.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${userId}/card-${Date.now()}.${extension}`
      const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, selectedPhoto, {
        cacheControl: '3600', contentType: selectedPhoto.type, upsert: false,
      })
      if (uploadError) {
        setSavingProfile(false)
        setStatus(uploadError.message.includes('Bucket') ? t('noBucket') : t('uploadFailed', { message: uploadError.message }))
        return
      }
      profileImagePath = path
      uploadedPath = path
    }

    const [{ error: profileError }, { error: athleteError }] = await Promise.all([
      supabase.from('profiles').upsert({ id: userId, full_name: name.trim(), province: province.trim(), team: team.trim(), position }),
      supabase.from('athlete_profiles').upsert({
        user_id: userId,
        display_name: name.trim(),
        sport: ACTIVE_SPORT,
        position: position || null,
        province: province.trim() || null,
        current_team: team.trim() || null,
        profile_image_url: profileImagePath || null,
      }, { onConflict: 'user_id' }),
    ])
    setSavingProfile(false)
    if (profileError || athleteError) {
      const error = profileError || athleteError
      if (uploadedPath) await supabase.storage.from(AVATAR_BUCKET).remove([uploadedPath])
      setStatus(error?.message.includes('athlete_profiles') ? t('profileNotReady') : t('saveFailed', { message: error?.message ?? '' }))
      return
    }
    // The replaced photo would otherwise stay in storage after the athlete changed it.
    const previousPath = uploadedPath ? avatarPath(savedPath, userId) : null
    if (previousPath) await supabase.storage.from(AVATAR_BUCKET).remove([previousPath])
    setSavedPath(profileImagePath)
    setSelectedPhoto(null)
    setStatus(t('saved'))
    track('player_card_identity_saved', { has_photo: Boolean(profileImagePath), position })
    router.refresh()
  }

  const makeCard = async (exportFormat: Format = format) => {
    const width = 1080
    const height = exportFormat === 'story' ? 1920 : 1350
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

    const cardW = 820, cardH = 1130, cardX = (width - cardW) / 2, cardY = exportFormat === 'story' ? 330 : 110
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
    ctx.textAlign = 'left'; ctx.fillStyle = colors.ink; ctx.font = '900 126px Impact, sans-serif'; ctx.fillText(skillText(cardPlayer.stats.ovr), cardX + 58, cardY + 120)
    ctx.font = '800 42px Arial, sans-serif'; ctx.fillText(cardPlayer.position, cardX + 64, cardY + 172)
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '900 54px Arial, sans-serif'; ctx.fillText(cardPlayer.name.toUpperCase(), width / 2, cardY + 758)
    ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.font = '600 29px Arial, sans-serif'; ctx.fillText(`${cardPlayer.team} · ${cardPlayer.province}`, width / 2, cardY + 805)
    const stats = skillEntries(player.stats)
    stats.forEach(([key, value], index) => { const x = cardX + 105 + index * 153; ctx.fillStyle = '#fff'; ctx.font = '900 42px Impact, Arial'; ctx.fillText(skillText(value), x, cardY + 950); ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.font = '700 21px Arial'; ctx.fillText(key, x, cardY + 992) })
    // A shared card must carry its own provenance. Starter stats are defaults, not
    // performance, so the exported image says so even when the page around it does not.
    if (!player.isRanked) {
      const pillW = 262, pillH = 54, pillX = cardX + cardW - pillW - 40, pillY = cardY + 52
      ctx.fillStyle = 'rgba(0,0,0,.62)'
      ctx.beginPath(); ctx.roundRect(pillX, pillY, pillW, pillH, 27); ctx.fill()
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.font = '800 23px Arial, sans-serif'
      ctx.fillText('STARTER · UNRANKED', pillX + pillW / 2, pillY + 35)
    }
    ctx.fillStyle = 'rgba(0,0,0,.68)'; ctx.fillRect(cardX, cardY + cardH - 70, cardW, 70); ctx.fillStyle = '#fff'; ctx.font = '800 22px Arial'; ctx.fillText('BALLDOENSAI.COM · YOUR GAME, YOUR STORY', width / 2, cardY + cardH - 27)
    if (exportFormat === 'story') { ctx.fillStyle = '#fff'; ctx.font = '900 44px Impact, Arial'; ctx.fillText('MY PLAYER CARD', width / 2, 175); ctx.fillStyle = colors.accent; ctx.font = '700 25px Arial'; ctx.fillText('BALLDOENSAI.COM', width / 2, 220) }
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create image')), 'image/png'))
  }

  const download = async () => {
    try {
      setStatus(t('rendering'))
      const blob = await makeCard(); const url = URL.createObjectURL(blob); const a = document.createElement('a')
      a.href = url; a.download = cardFilename; a.click(); URL.revokeObjectURL(url)
      track('player_card_downloaded', { format, theme, has_photo: Boolean(imageUrl), rating: player.isRanked ? 'ranked' : 'starter' })
      setStatus(t('downloaded'))
    } catch { setStatus(t('renderFailed')) }
  }

  const downloadBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = cardFilename
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 500)
  }

  const copyProfileLink = async () => {
    if (!publicProfilePath) {
      setStatus(t('needPublicProfile'))
      return false
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${publicProfilePath}`)
      return true
    } catch {
      setStatus(t('copyFailed'))
      return false
    }
  }

  const share = async () => {
    try {
      setStatus(t('preparingShare'))
      const blob = await makeCard(); const file = new File([blob], 'balldoensai-player-card.png', { type: 'image/png' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'My BallDoenSai Player Card', text: t('shareText'), url: publicProfilePath ? `${window.location.origin}${publicProfilePath}` : undefined, files: [file] })
        track('player_card_shared', { format, theme, has_photo: Boolean(imageUrl), rating: player.isRanked ? 'ranked' : 'starter' })
        setStatus(t('shareOpened'))
      } else {
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'balldoensai-player-card.png'; a.click(); URL.revokeObjectURL(url)
        track('player_card_downloaded', { format, theme, has_photo: Boolean(imageUrl), rating: player.isRanked ? 'ranked' : 'starter' })
        setStatus(t('shareDownloaded'))
      }
    } catch (error) { if ((error as Error).name !== 'AbortError') setStatus(t('shareFailed')) }
  }

  const shareToInstagram = async () => {
    setFormat('story')
    try {
      setStatus(t('preparingInstagram'))
      const blob = await makeCard('story')
      const file = new File([blob], cardFilename, { type: 'image/png' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'My BallDoenSai Player Card', text: 'My BallDoenSai Player Card ⚽', files: [file] })
        await copyProfileLink()
        track('player_card_shared', { destination: 'instagram', format: 'story', theme })
        setStatus(t('instagramOpened'))
      } else {
        downloadBlob(blob)
        await copyProfileLink()
        setStatus(t('instagramDownloaded'))
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setStatus(t('instagramFailed'))
    }
  }

  const shareToTikTok = async () => {
    window.open(`https://www.tiktok.com/upload?lang=${locale === 'en' ? 'en' : 'th-TH'}`, '_blank', 'noopener,noreferrer')
    try {
      setStatus(t('preparingTiktok'))
      const blob = await makeCard('story')
      downloadBlob(blob)
      await copyProfileLink()
      track('player_card_shared', { destination: 'tiktok', format: 'story', theme })
      setStatus(t('tiktokDownloaded'))
    } catch {
      setStatus(t('tiktokFailed'))
    }
  }

  const shareToFacebook = () => {
    if (!publicProfilePath) {
      setStatus(t('facebookNeedsPublic'))
      return
    }
    const shareUrl = `${window.location.origin}${publicProfilePath}`
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank', 'noopener,noreferrer')
    track('player_card_shared', { destination: 'facebook', format, theme })
    setStatus(t('facebookOpened'))
  }

  return <section className="card-builder">
    <div className="card-builder-copy">
      <p className="card-eyebrow"><Sparkles size={15} /> YOUR GAME · YOUR STORY</p>
      <h1>{t('titleTop')}<br /><em>{t('titleBottom')}</em></h1>
      <p>{t('intro')}</p>
      {!player.isRanked && <div className="card-starter-note"><Trophy size={16} /><span><b>STARTER CARD</b> · {t('starterNote')}</span></div>}
      <div className="card-identity-fields" aria-label={t('fieldsLabel')}>
        <span>{t('fieldsTitle')}</span>
        <div className="card-identity-grid">
          <label>{t('name')}<input value={name} onChange={event => setName(event.target.value.slice(0, 60))} placeholder={t('namePlaceholder')} /></label>
          <label>{t('team')}<input value={team} onChange={event => setTeam(event.target.value.slice(0, 80))} placeholder={t('teamPlaceholder')} /></label>
          <label>{t('province')}<input value={province} onChange={event => setProvince(event.target.value.slice(0, 60))} placeholder={t('provincePlaceholder')} /></label>
          <div><small>{t('position')}</small><div className="card-position-options">{['FW', 'MF', 'DF', 'GK'].map(item => <button type="button" key={item} onClick={() => setPosition(item)} className={position === item ? 'is-selected' : ''}>{item}</button>)}</div></div>
        </div>
        <button type="button" className="card-save-identity" disabled={savingProfile} onClick={saveCardIdentity}>{savingProfile ? <Loader2 size={17} className="card-spinning" /> : <Save size={17} />}{savingProfile ? t('savingShort') : t('save')}</button>
        {!publicProfilePath && <p className="card-public-hint">{t('publicHintBefore')}<Link href="/profile/edit#privacy">{t('publicHintLink')}</Link>{t('publicHintAfter')}</p>}
      </div>
      <div className="card-builder-controls">
        <span>{t('design')}</span><div className="card-theme-options">{(['gold', 'red', 'ice'] as Theme[]).map(item => <button key={item} onClick={() => setTheme(item)} className={`card-theme-option is-${item} ${theme === item ? 'is-selected' : ''}`} aria-label={themeLabel[item]}><i /> {themeLabel[item]}</button>)}</div>
        <span>{t('format')}</span><div className="card-format-options"><button onClick={() => setFormat('story')} className={format === 'story' ? 'is-selected' : ''}>9:16 <small>Story / TikTok</small></button><button onClick={() => setFormat('feed')} className={format === 'feed' ? 'is-selected' : ''}>4:5 <small>Instagram Feed</small></button></div>
        <input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={choosePhoto} />
        <button className="card-photo-button" onClick={() => inputRef.current?.click()}><ImagePlus size={18} /> {imageUrl ? t('changePhoto') : t('choosePhoto')}</button>
        <p className="card-photo-help">{t('photoHelp')}</p>
      </div>
    </div>
    <div className="card-builder-preview">
      <div className={`player-card-poster is-${format}`}><div className={`player-card is-${theme}`}>
        <div className="player-card-glint" /><div className="player-card-rating"><b>{skillText(cardPlayer.stats.ovr)}</b><span>{cardPlayer.position}</span></div>
        {!player.isRanked && <span className="player-card-starter">STARTER · UNRANKED</span>}
        <div className="player-card-photo" style={imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined}><div className="player-card-photo-fallback">{cardPlayer.position}</div></div>
        <div className="player-card-detail"><h2>{cardPlayer.name}</h2>{player.isVerified && <CheckCircle2 size={17} />}<p>{cardPlayer.team} · {cardPlayer.province}</p><div>{skillEntries(cardPlayer.stats).map(([key, value]) => <span key={key}><b>{skillText(value)}</b><small>{key}</small></span>)}</div></div>
        <footer>BALLDOENSAI.COM · YOUR GAME, YOUR STORY</footer>
      </div></div>
      <div className="card-share-actions"><button onClick={download}><Download size={19} /> {t('download')}</button><button className="card-share-primary" onClick={share}><Share2 size={19} /> {t('share')}</button></div>
      <div className="card-social-deck" aria-label="Share your player card">
        <div><span>POST YOUR CARD</span><b>{t('channels')}</b></div>
        <div className="card-social-actions">
          <button type="button" onClick={shareToInstagram} className="card-social-instagram"><Instagram size={18} /> IG Story</button>
          <button type="button" onClick={shareToTikTok} className="card-social-tiktok"><Music2 size={18} /> TikTok</button>
          <button type="button" onClick={shareToFacebook} className="card-social-facebook"><Facebook size={18} /> Facebook</button>
          {publicProfilePath && <button type="button" onClick={async () => { if (await copyProfileLink()) setStatus(t('linkCopied')) }} className="card-social-copy"><Copy size={17} /> Copy link</button>}
        </div>
      </div>
      <p className="card-share-note"><Instagram size={15} /> {t('shareNote')}</p>
      {status && <p className="card-status" role="status">{status}</p>}
    </div>
  </section>
}
