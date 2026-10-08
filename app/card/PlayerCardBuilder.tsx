'use client'

import { type ChangeEvent, type PointerEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Camera, Check, Copy, Download, ImagePlus, Loader2, PencilLine, RotateCw, Share2, Trash2, X } from 'lucide-react'
import { track } from '@vercel/analytics'
import { createClient } from '@/lib/supabase'
import { ACTIVE_SPORT } from '@/lib/season'
import { skillEntries, skillText } from '@/lib/skill-ratings'
import { AVATAR_BUCKET, avatarPath } from '@/lib/athlete-avatar'
import { saveAthleteProfile } from '@/lib/athlete-private'
import { positionLabel, type CardProvenance, type CardSeason, type PlayerCardStats } from '@/lib/player-card'
import { renderCardImage, type CardFormat, type CardTheme } from './card-export'

type Player = {
  name: string
  position: string
  team: string
  province: string
  // A signed URL to show, and the stored object path (T51: the bucket is private).
  imageUrl: string | null
  imagePath?: string | null
  hasProfile?: boolean
  isVerified: boolean
  isRanked: boolean
  // Skill ratings are null until a coach or admin assesses them (T32); shown as a dash.
  stats: PlayerCardStats
  provenance?: CardProvenance
  season?: CardSeason | null
}

type Tab = 'photo' | 'info' | 'style'
const POSITIONS = ['FW', 'MF', 'DF', 'GK']
const THEMES: CardTheme[] = ['red', 'gold', 'ice']
const THEME_NAMES: Record<CardTheme, string> = { red: 'Red', gold: 'Gold', ice: 'Ice' }
const MAX_PHOTO = 8 * 1024 * 1024

export default function PlayerCardBuilder({ player, publicProfilePath, userId, seasonLabel = '' }: { player: Player; publicProfilePath: string | null; userId: string; seasonLabel?: string }) {
  const router = useRouter()
  const t = useTranslations('card')
  const locale = useLocale()
  const [tab, setTab] = useState<Tab>(player.imageUrl ? 'style' : 'photo')
  // Until there is a name the page has one thing to do, so the tabs and the share bar wait for it.
  const [naming, setNaming] = useState(false)
  const [theme, setTheme] = useState<CardTheme>('red')
  const [format, setFormat] = useState<CardFormat>('story')
  const [flipped, setFlipped] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const initial = { name: player.name, team: player.team, province: player.province, position: player.position }
  const [saved, setSaved] = useState(initial)
  const [fields, setFields] = useState(initial)
  const [savedPath, setSavedPath] = useState<string | null>(player.imagePath ?? null)
  const [hasProfile, setHasProfile] = useState(Boolean(player.hasProfile))
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [localImage, setLocalImage] = useState<string | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const focusNameNext = useRef(false)
  const reduceMotion = useRef(false)

  const imageUrl = localImage || (removePhoto ? null : player.imageUrl)
  const dirty = Boolean(photoFile) || removePhoto || (Object.keys(fields) as (keyof typeof fields)[]).some(key => fields[key].trim() !== saved[key].trim())
  const named = Boolean(fields.name.trim())
  const minimal = !named && !naming
  const displayName = fields.name.trim() || t('yourName')
  const meta = [fields.team.trim(), fields.province.trim()].filter(Boolean).join(' · ')
  const provenance = player.provenance ?? (player.isRanked ? 'performance' : 'self')
  const matches = player.season?.matches ?? 0
  const chip = provenance === 'performance'
    ? (matches > 0 ? t('provenance.performance', { count: matches }) : t('provenance.performanceNoCount'))
    : t(`provenance.${provenance}`)
  const unlock = `${t('unlockBefore')}${t('unlockRating')}${t('unlockAfter')}`
  const shareUrl = () => publicProfilePath ? `${window.location.origin}${publicProfilePath}` : null
  const cardFilename = `balldoensai-${(fields.name.trim() || 'card').toLowerCase().replace(/\s+/g, '-')}-card.png`

  // "Add your name" opens the info tab; the field exists only after that render, so focus waits for it.
  const focusNameField = () => {
    const field = nameInput.current
    if (!field) return
    // Centre it: the sticky save and share bars and the bottom nav cover the foot of the screen.
    field.focus({ preventScroll: true })
    field.scrollIntoView({ block: 'center', behavior: reduceMotion.current ? 'auto' : 'smooth' })
  }
  useEffect(() => {
    if (focusNameNext.current && tab === 'info' && nameInput.current) { focusNameNext.current = false; focusNameField() }
  }, [tab, naming])
  useEffect(() => { reduceMotion.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false }, [])
  useEffect(() => () => { if (localImage) URL.revokeObjectURL(localImage) }, [localImage])
  useEffect(() => {
    if (!status) return
    const timer = window.setTimeout(() => setStatus(''), 5000)
    return () => window.clearTimeout(timer)
  }, [status])
  useEffect(() => {
    if (!shareOpen) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setShareOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [shareOpen])

  const tilt = (event: PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current
    if (!stage || reduceMotion.current || event.pointerType === 'touch') return
    const box = stage.getBoundingClientRect()
    const x = (event.clientX - box.left) / box.width - 0.5
    const y = (event.clientY - box.top) / box.height - 0.5
    stage.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`)
    stage.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`)
    stage.style.setProperty('--sheen', `${(50 + x * 60).toFixed(1)}%`)
  }
  const untilt = () => {
    const stage = stageRef.current
    if (!stage) return
    stage.style.removeProperty('--rx'); stage.style.removeProperty('--ry'); stage.style.removeProperty('--sheen')
  }

  const startNaming = () => {
    focusNameNext.current = true
    setNaming(true)
    setTab('info')
  }

  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setStatus(t('chooseImage')); return }
    if (file.size > MAX_PHOTO) { setStatus(t('imageTooLarge')); return }
    setPhotoFile(file)
    setRemovePhoto(false)
    setLocalImage(URL.createObjectURL(file))
    setFlipped(false)
    setStatus(t('photoReady'))
  }

  const clearPhoto = () => {
    setPhotoFile(null)
    setLocalImage(null)
    setRemovePhoto(Boolean(savedPath))
  }

  const save = async () => {
    if (!fields.name.trim()) { setTab('info'); setStatus(t('nameRequired')); return }
    setBusy(true)
    setStatus(t('saving'))
    const supabase = createClient()
    let nextPath = removePhoto ? null : savedPath
    let uploadedPath: string | null = null
    if (photoFile) {
      const extension = photoFile.type === 'image/png' ? 'png' : photoFile.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${userId}/card-${Date.now()}.${extension}`
      const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, photoFile, { cacheControl: '3600', contentType: photoFile.type, upsert: false })
      if (error) {
        setBusy(false)
        setStatus(error.message.includes('Bucket') ? t('noBucket') : t('uploadFailed', { message: error.message }))
        return
      }
      nextPath = path
      uploadedPath = path
    }
    const clean = { name: fields.name.trim(), team: fields.team.trim(), province: fields.province.trim(), position: fields.position }
    // A plain insert or update (lib/athlete-private.ts): SQL58 withholds the birth date,
    // which an upsert would need to read back.
    const [{ error: profileError }, { error: athleteError }] = await Promise.all([
      supabase.from('profiles').upsert({ id: userId, full_name: clean.name, province: clean.province, team: clean.team, position: clean.position || null }),
      saveAthleteProfile(supabase, {
        user_id: userId,
        display_name: clean.name,
        sport: ACTIVE_SPORT,
        position: clean.position || null,
        province: clean.province || null,
        current_team: clean.team || null,
        profile_image_url: nextPath,
      }, hasProfile),
    ])
    setBusy(false)
    const error = profileError || athleteError
    if (error) {
      if (uploadedPath) await supabase.storage.from(AVATAR_BUCKET).remove([uploadedPath])
      setStatus(error.message.includes('athlete_profiles') ? t('profileNotReady') : t('saveFailed', { message: error.message }))
      return
    }
    // A replaced or removed photo would otherwise stay in storage.
    const previous = (uploadedPath || removePhoto) ? avatarPath(savedPath, userId) : null
    if (previous) await supabase.storage.from(AVATAR_BUCKET).remove([previous])
    setSavedPath(nextPath)
    setSaved(clean)
    setFields(clean)
    setHasProfile(true)
    setPhotoFile(null)
    setRemovePhoto(false)
    setStatus(t('saved'))
    track('player_card_identity_saved', { has_photo: Boolean(nextPath), position: clean.position })
    router.refresh()
  }

  const makeImage = (exportFormat: CardFormat = format) => renderCardImage({
    theme, format: exportFormat, name: displayName, position: positionLabel(fields.position), meta, imageUrl, stats: player.stats,
    isRanked: player.isRanked, power: player.season?.power ?? null, chip, chipTone: provenance === 'performance' ? 'ok' : provenance === 'coach' ? 'coach' : 'self',
    unlock, starterLabel: t('starterLabel'), season: seasonLabel,
  })
  const analytics = { format, theme, has_photo: Boolean(imageUrl), rating: player.isRanked ? 'ranked' : 'starter' }

  const downloadBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = cardFilename
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 500)
  }

  const saveImage = async () => {
    try {
      setStatus(t('rendering'))
      downloadBlob(await makeImage())
      track('player_card_downloaded', analytics)
      setStatus(t('downloaded'))
    } catch { setStatus(t('renderFailed')) }
  }

  const copyLink = async () => {
    const url = shareUrl()
    if (!url) { setStatus(t('needPublicProfile')); return false }
    try { await navigator.clipboard.writeText(url); setStatus(t('linkCopied')); return true } catch { setStatus(t('copyFailed')); return false }
  }

  // Instagram and LINE without a public link: the phone's own share menu with the image.
  const shareFile = async (destination: string, exportFormat: CardFormat) => {
    try {
      setStatus(t('preparingShare'))
      const blob = await makeImage(exportFormat)
      const file = new File([blob], cardFilename, { type: 'image/png' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'My BallDoenSai Player Card', text: t('shareText'), files: [file] })
        track('player_card_shared', { ...analytics, destination })
        setStatus(t('shareOpened'))
      } else {
        downloadBlob(blob)
        track('player_card_downloaded', { ...analytics, destination })
        setStatus(t('shareDownloaded'))
      }
    } catch (error) { if ((error as Error).name !== 'AbortError') setStatus(t('shareFailed')) }
  }

  const shareInstagram = async () => {
    setFormat('story')
    await shareFile('instagram', 'story')
    if (publicProfilePath) await copyLink()
  }

  const shareTikTok = async () => {
    window.open(`https://www.tiktok.com/upload?lang=${locale === 'en' ? 'en' : 'th-TH'}`, '_blank', 'noopener,noreferrer')
    try {
      setStatus(t('preparingTiktok'))
      downloadBlob(await makeImage('story'))
      if (publicProfilePath) await copyLink()
      track('player_card_shared', { ...analytics, destination: 'tiktok', format: 'story' })
      setStatus(t('tiktokDownloaded'))
    } catch { setStatus(t('tiktokFailed')) }
  }

  const shareLine = async () => {
    const url = shareUrl()
    if (!url) { await shareFile('line', format); return }
    window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer')
    track('player_card_shared', { ...analytics, destination: 'line' })
    setStatus(t('lineOpened'))
  }

  const shareFacebook = () => {
    const url = shareUrl()
    if (!url) { setStatus(t('facebookNeedsPublic')); return }
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer')
    track('player_card_shared', { ...analytics, destination: 'facebook' })
    setStatus(t('facebookOpened'))
  }

  const stats = skillEntries(player.stats)
  const front = <div className={`pc-card pc-face is-${theme}`} aria-hidden={flipped}>
    <div className="pc-stripes" />
    <div className="pc-photo" style={imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined}>
      {!imageUrl && <label htmlFor="pc-photo-library" className="pc-add" onClick={event => event.stopPropagation()}><ImagePlus size={30} strokeWidth={1.6} /><span>{t('addPhoto')}</span></label>}
    </div>
    <div className={`pc-ovr${player.stats.ovr === null ? ' is-empty' : ''}`}><b>{skillText(player.stats.ovr)}</b><span>{positionLabel(fields.position)}</span><small>{player.isRanked && player.season?.power != null ? `POWER ${player.season.power.toLocaleString('en-US')}` : t('starterLabel')}</small></div>
    <div className="pc-brand" aria-hidden="true">B</div>
    <div className="pc-info">
      <span className={`pc-chip is-${provenance}`}>{provenance !== 'self' && <Check size={12} strokeWidth={3} />}{chip}</span>
      <h2 className={`pc-name${displayName.length > 14 ? ' is-long' : ''}`}>{displayName}</h2>
      {meta && <p className="pc-meta">{meta}</p>}
      {player.isRanked
        ? <div className="pc-stats">{stats.map(([key, value]) => <div key={key}><b>{skillText(value)}</b><span>{key}</span></div>)}</div>
        : <p className="pc-unlock">{t('unlockBefore')}<b>{t('unlockRating')}</b>{t('unlockAfter')}</p>}
      <div className="pc-foot"><span>BALLDOENSAI.COM</span><span>SEASON {seasonLabel}</span></div>
    </div>
    <div className="pc-sheen" />
  </div>

  const season = player.season
  const back = <div className="pc-card pc-back" aria-hidden={!flipped}>
    <p className="pc-back-title">{t('backTitle', { season: seasonLabel })}</p>
    <h2 className="pc-back-name">{displayName}</h2>
    {season && season.matches > 0
      ? <div className="pc-back-grid">
          <div><b>{season.matches}</b><span>{t('backMatches')}</span></div>
          <div><b>{season.goals}</b><span>{t('backGoals')}</span></div>
          <div><b>{season.assists}</b><span>{t('backAssists')}</span></div>
          <div><b>{season.mvps}</b><span>{t('backMvps')}</span></div>
          {season.power !== null && <div className="is-wide"><b>{season.power.toLocaleString('en-US')}</b><span>{t('backPower')}</span></div>}
        </div>
      : <p className="pc-back-empty">{t('backEmpty')}</p>}
    <p className="pc-back-source">{t('backSource')}</p>
    {publicProfilePath
      ? <Link href={publicProfilePath} className="pc-back-link" onClick={event => event.stopPropagation()} tabIndex={flipped ? 0 : -1}>{t('backProfile')} →</Link>
      : <p className="pc-back-private">{t('backPrivate')}</p>}
  </div>

  return <section className="pc">
    <div className="pc-intro">
      <h1>{t('pageTitle')}</h1>
      <p>{named ? t('pageLead') : t('pageLeadStart')}</p>
    </div>
    <input id="pc-photo-camera" className="pc-sr" type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={choosePhoto} />
    <input id="pc-photo-library" className="pc-sr" type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} />

    <div className="pc-stage" ref={stageRef} onPointerMove={tilt} onPointerLeave={untilt}>
      <div className={`pc-tilt${flipped ? ' is-flipped' : ''}`} onClick={() => setFlipped(value => !value)}>
        <div className="pc-flipper">{front}{back}</div>
      </div>
      <button type="button" className="pc-flip-button" onClick={() => setFlipped(value => !value)} aria-pressed={flipped}><RotateCw size={15} />{flipped ? t('flipBackHint') : t('flipHint')}</button>
      {minimal && <>
        <button type="button" className="pc-name-cta" onClick={startNaming}><PencilLine size={18} aria-hidden="true" />{t('enterName')}</button>
        <p className="pc-start-hint">{t('startHint')}</p>
      </>}
    </div>

    {!minimal && <div className="pc-panel">
      <div className="pc-tabs" role="tablist" aria-label={t('tabs.label')}>
        {(['photo', 'info', 'style'] as Tab[]).map(item => <button key={item} type="button" role="tab" id={`pc-tab-${item}`} aria-controls={`pc-panel-${item}`} aria-selected={tab === item} className={tab === item ? 'is-on' : ''} onClick={() => setTab(item)}>{t(`tabs.${item}`)}</button>)}
      </div>

      <div className="pc-tab-body">
        {tab === 'photo' && <div role="tabpanel" id="pc-panel-photo" aria-labelledby="pc-tab-photo">
          <div className="pc-photo-options">
            <label htmlFor="pc-photo-camera" className="pc-option"><em><Camera size={18} /></em>{t('takePhoto')}</label>
            <label htmlFor="pc-photo-library" className="pc-option"><em><ImagePlus size={18} /></em>{t('pickPhoto')}</label>
          </div>
          {imageUrl && <button type="button" className="pc-text-button" onClick={clearPhoto}><Trash2 size={15} />{t('removePhoto')}</button>}
          <p className="pc-tip"><b>{t('photoTipLabel')}</b> {t('photoTip')}</p>
        </div>}

        {tab === 'info' && <div role="tabpanel" id="pc-panel-info" aria-labelledby="pc-tab-info" aria-label={t('fieldsLabel')}>
          <div className="pc-fields">
            <label className="pc-field is-wide"><span>{t('name')}</span><input ref={nameInput} value={fields.name} maxLength={60} placeholder={t('namePlaceholder')} onChange={event => setFields(current => ({ ...current, name: event.target.value }))} /></label>
            <label className="pc-field"><span>{t('team')}</span><input value={fields.team} maxLength={80} placeholder={t('teamPlaceholder')} onChange={event => setFields(current => ({ ...current, team: event.target.value }))} /></label>
            <label className="pc-field"><span>{t('province')}</span><input value={fields.province} maxLength={60} placeholder={t('provincePlaceholder')} onChange={event => setFields(current => ({ ...current, province: event.target.value }))} /></label>
          </div>
          <p className="pc-label">{t('position')}</p>
          <div className="pc-positions">{POSITIONS.map(item => <button key={item} type="button" aria-pressed={fields.position === item} className={fields.position === item ? 'is-on' : ''} onClick={() => setFields(current => ({ ...current, position: item }))}>{item}</button>)}</div>
        </div>}

        {tab === 'style' && <div role="tabpanel" id="pc-panel-style" aria-labelledby="pc-tab-style">
          <p className="pc-label">{t('theme')}</p>
          <div className="pc-themes">{THEMES.map(item => <button key={item} type="button" aria-pressed={theme === item} className={`pc-theme is-${item}${theme === item ? ' is-on' : ''}`} onClick={() => setTheme(item)}><i />{THEME_NAMES[item]}</button>)}</div>
          <p className="pc-label">{t('size')}</p>
          <div className="pc-formats">
            <button type="button" aria-pressed={format === 'story'} className={format === 'story' ? 'is-on' : ''} onClick={() => setFormat('story')}><i className="is-story" />{t('formatStory')}</button>
            <button type="button" aria-pressed={format === 'feed'} className={format === 'feed' ? 'is-on' : ''} onClick={() => setFormat('feed')}><i className="is-feed" />{t('formatFeed')}</button>
          </div>
        </div>}
      </div>

      {!dirty && hasProfile && <div className="pc-savebar" aria-live="polite"><span className="pc-saved"><Check size={14} />{t('savedChip')}</span></div>}

      {(named || dirty) && <div className="pc-cta">
        {/* With the share button in the sticky bar, so saving is in view the moment something changes. */}
        {dirty && <div className="pc-savebar is-dirty" role="status"><span>{t('unsaved')}</span><button type="button" onClick={save} disabled={busy}>{busy ? <Loader2 size={15} className="pc-spin" /> : <Check size={15} />}{busy ? t('savingShort') : t('saveChanges')}</button></div>}
        {named && <>
          <button type="button" className="pc-primary" onClick={() => setShareOpen(true)}><Share2 size={19} />{t('share')}</button>
          <button type="button" className="pc-secondary" onClick={saveImage} aria-label={t('saveImage')} title={t('saveImage')}><Download size={20} /></button>
        </>}
      </div>}
    </div>}

    {status && <p className="pc-toast" role="status">{status}</p>}

    {shareOpen && <div className="pc-sheet-layer" onClick={() => setShareOpen(false)}>
      <div className="pc-sheet" role="dialog" aria-modal="true" aria-labelledby="pc-share-title" onClick={event => event.stopPropagation()}>
        <div className="pc-sheet-head">
          <div><h2 id="pc-share-title">{t('shareTitle')}</h2><p>{format === 'story' ? t('shareStory') : t('shareFeed')}</p></div>
          <button type="button" className="pc-close" onClick={() => setShareOpen(false)} aria-label={t('close')}><X size={18} /></button>
        </div>
        <div className="pc-apps">
          <button type="button" onClick={shareInstagram}><i className="is-ig">IG</i>IG Story</button>
          <button type="button" onClick={shareTikTok}><i className="is-tt">TT</i>TikTok</button>
          <button type="button" onClick={shareLine}><i className="is-line">LINE</i>LINE</button>
          <button type="button" onClick={shareFacebook}><i className="is-fb">f</i>Facebook</button>
        </div>
        <div className="pc-link">
          <span>{publicProfilePath ? `${typeof window === 'undefined' ? '' : window.location.host}${publicProfilePath}` : t('publicLinkMissing')}</span>
          {publicProfilePath
            ? <button type="button" onClick={copyLink}><Copy size={14} />{t('copyLink')}</button>
            : <Link href="/profile/edit#privacy">{t('editProfile')}</Link>}
        </div>
        <button type="button" className="pc-save-image" onClick={saveImage}><Download size={18} />{t('saveImage')}</button>
      </div>
    </div>}
  </section>
}
