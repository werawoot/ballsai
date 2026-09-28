'use client'

import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Award, BadgeCheck, Camera, CheckCircle2, ImageIcon, Link2, Loader2, Plus, ShieldAlert, Trash2, Upload, Video as VideoIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { ACTIVE_SPORT } from '@/lib/season'
import { ageOn, saveAthleteProfile, thaiDate } from '@/lib/athlete-private'
import { MINOR_UNDER } from '@/lib/profile-readiness'
import type messagesTh from '@/messages/th.json'

type ProfileForm = { full_name?: string | null; province?: string | null; team?: string | null; position?: string | null }
type AthleteProfileForm = {
  display_name: string
  birth_date?: string | null
  position?: string | null
  province?: string | null
  height_cm?: number | null
  weight_kg?: number | null
  current_team?: string | null
  bio?: string | null
  profile_image_url?: string | null
  guardian_consent_at?: string | null
  is_public: boolean
  verification_level: 'self' | 'coach_verified' | 'performance_verified'
}
type Video = { id: number; title: string; video_url: string; video_type: 'highlight' | 'match' | 'training' }
type Achievement = { id: number; title: string; event_name?: string | null; verification_status: 'unverified' | 'pending' | 'verified' | 'rejected' }
type UploadedHighlight = { id: number; title: string; media_path: string; media_type: 'image' | 'video'; moderation_status?: 'visible' | 'hidden' }
type MessageKey = keyof (typeof messagesTh)['profileEdit']['messages']
type Status = { kind: 'success' | 'error'; key: MessageKey } | null

const MAX_AVATAR_SIZE = 5 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_HIGHLIGHT_SIZE = 25 * 1024 * 1024
const ALLOWED_HIGHLIGHT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
const POSITIONS = ['FW', 'MF', 'DF', 'GK'] as const
const VIDEO_TYPES: Video['video_type'][] = ['highlight', 'match', 'training']

function isSupportedVideoUrl(value: string) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return url.protocol === 'https:' && (
      host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'tiktok.com' || host.endsWith('.tiktok.com')
    )
  } catch {
    return false
  }
}

function avatarPathFromPublicUrl(value: string, userId: string) {
  const marker = '/storage/v1/object/public/athlete-avatars/'
  const markerIndex = value.indexOf(marker)
  if (markerIndex === -1) return null
  const path = decodeURIComponent(value.slice(markerIndex + marker.length).split('?')[0])
  return path.startsWith(`${userId}/`) ? path : null
}

// The database enforces the publishing rules as well as this form (sql/21,
// guardian-consent-enforcement). Its codes become a sentence a young athlete can act on;
// anything unexpected is logged, never shown raw.
function saveErrorKey(message: string): MessageKey {
  if (message.includes('PUBLIC_REQUIRES_GUARDIAN_LINK')) return 'needsGuardianLink'
  if (message.includes('PUBLIC_REQUIRES_GUARDIAN_CONSENT')) return 'minorNeedsConsent'
  if (message.includes('PUBLIC_REQUIRES_BIRTH_DATE')) return 'needsBirthDate'
  if (message.includes('athlete_profiles')) return 'notReady'
  console.error(JSON.stringify({ level: 'error', event: 'athlete_profile_save_failed', message }))
  return 'saveFailed'
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return <section id={id} className="pf-card" aria-labelledby={`${id}-title`}>
    <div className="pf-card-head"><div><h2 id={`${id}-title`} className="pf-card-title">{title}</h2><p className="pf-card-desc">{description}</p></div></div>
    {children}
  </section>
}

function StatusLine({ status, text }: { status: Status; text: (key: MessageKey) => string }) {
  return <p className={`pf-status${status ? ` is-${status.kind}` : ''}`} role="status" aria-live="polite">{status ? text(status.key) : null}</p>
}

export default function EditProfileForm({
  profile,
  athleteProfile,
  videos: initialVideos,
  achievements: initialAchievements,
  highlights: initialHighlights,
  userId,
}: {
  profile: ProfileForm | null
  athleteProfile: AthleteProfileForm | null
  videos: Video[]
  achievements: Achievement[]
  highlights: UploadedHighlight[]
  userId: string
}) {
  const t = useTranslations('profileEdit')
  const router = useRouter()
  const initial = useMemo(() => ({
    displayName: athleteProfile?.display_name || profile?.full_name || '',
    birthDate: athleteProfile?.birth_date ?? '',
    province: athleteProfile?.province || profile?.province || '',
    team: athleteProfile?.current_team || profile?.team || '',
    position: athleteProfile?.position || profile?.position || '',
    height: athleteProfile?.height_cm?.toString() ?? '',
    weight: athleteProfile?.weight_kg?.toString() ?? '',
    bio: athleteProfile?.bio ?? '',
    isPublic: athleteProfile?.is_public ?? false,
  }), [athleteProfile, profile])
  const [fields, setFields] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const set = <K extends keyof typeof fields>(key: K) => (value: (typeof fields)[K]) => setFields(current => ({ ...current, [key]: value }))
  const [profileImageUrl, setProfileImageUrl] = useState(athleteProfile?.profile_image_url ?? '')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
  const [removeCurrentImage, setRemoveCurrentImage] = useState(false)
  const hasGuardianConsent = Boolean(athleteProfile?.guardian_consent_at)
  const [hasProfile, setHasProfile] = useState(Boolean(athleteProfile))
  const [videos, setVideos] = useState(initialVideos)
  const [achievements, setAchievements] = useState(initialAchievements)
  const [highlights, setHighlights] = useState(initialHighlights)
  const [videoTitle, setVideoTitle] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoType, setVideoType] = useState<Video['video_type']>('highlight')
  const [achievementTitle, setAchievementTitle] = useState('')
  const [achievementEvent, setAchievementEvent] = useState('')
  const [highlightTitle, setHighlightTitle] = useState('')
  const [highlightFile, setHighlightFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [detailsStatus, setDetailsStatus] = useState<Status>(null)
  const [mediaStatus, setMediaStatus] = useState<Status>(null)
  const [achievementStatus, setAchievementStatus] = useState<Status>(null)
  const message = (key: MessageKey) => t(`messages.${key}`)

  useEffect(() => () => { if (imagePreviewUrl.startsWith('blob:')) URL.revokeObjectURL(imagePreviewUrl) }, [imagePreviewUrl])

  const age = fields.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(fields.birthDate) ? ageOn(fields.birthDate, thaiDate(new Date())) : null
  const isMinor = age !== null && age < MINOR_UNDER
  const canPublish = Boolean(fields.birthDate) && (!isMinor || hasGuardianConsent)
  const displayedImageUrl = imagePreviewUrl || (removeCurrentImage ? '' : profileImageUrl)
  const dirty = selectedImage !== null || removeCurrentImage || (Object.keys(fields) as (keyof typeof fields)[]).some(key => fields[key] !== saved[key])

  const shownStatus = detailsStatus && (detailsStatus.kind === 'error' || !dirty) ? detailsStatus : null

  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!ALLOWED_AVATAR_TYPES.has(file.type)) return setDetailsStatus({ kind: 'error', key: 'photoType' })
    if (file.size > MAX_AVATAR_SIZE) return setDetailsStatus({ kind: 'error', key: 'photoSize' })
    setDetailsStatus(null)
    setSelectedImage(file)
    setRemoveCurrentImage(false)
    setImagePreviewUrl(URL.createObjectURL(file))
  }

  const clearImage = () => {
    setSelectedImage(null)
    setImagePreviewUrl('')
    setRemoveCurrentImage(true)
  }

  const saveProfile = async () => {
    setDetailsStatus(null)
    if (!fields.displayName.trim() || !fields.birthDate) return setDetailsStatus({ kind: 'error', key: 'nameAndBirth' })
    if (fields.isPublic && !canPublish) return setDetailsStatus({ kind: 'error', key: 'minorNeedsConsent' })

    const supabase = createClient()
    setSaving(true)
    const previousAvatarPath = avatarPathFromPublicUrl(profileImageUrl, userId)
    let uploadedAvatarPath: string | null = null
    let nextProfileImageUrl = removeCurrentImage ? '' : profileImageUrl

    if (selectedImage) {
      const extensionByType: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
      uploadedAvatarPath = `${userId}/profile-${Date.now()}.${extensionByType[selectedImage.type]}`
      const { error: uploadError } = await supabase.storage.from('athlete-avatars').upload(uploadedAvatarPath, selectedImage, {
        cacheControl: '3600',
        contentType: selectedImage.type,
        upsert: false,
      })
      if (uploadError) {
        setSaving(false)
        return setDetailsStatus({ kind: 'error', key: uploadError.message.includes('Bucket') ? 'storageNotReady' : 'photoUploadFailed' })
      }
      nextProfileImageUrl = supabase.storage.from('athlete-avatars').getPublicUrl(uploadedAvatarPath).data.publicUrl
    }

    const [{ error: privateProfileError }, { error: athleteProfileError }] = await Promise.all([
      supabase.from('profiles').upsert({
        id: userId,
        full_name: fields.displayName.trim(),
        province: fields.province.trim(),
        team: fields.team.trim(),
        position: fields.position,
      }),
      // A plain insert or update: SQL58 lets an athlete write their birth date but not read
      // it back through an upsert. The guardian consent time is set only by the guardian
      // link functions (sql/21), so the form does not send it.
      saveAthleteProfile(supabase, {
        user_id: userId,
        display_name: fields.displayName.trim(),
        birth_date: fields.birthDate,
        sport: ACTIVE_SPORT,
        position: fields.position || null,
        province: fields.province.trim() || null,
        height_cm: fields.height ? Number(fields.height) : null,
        weight_kg: fields.weight ? Number(fields.weight) : null,
        current_team: fields.team.trim() || null,
        bio: fields.bio.trim() || null,
        profile_image_url: nextProfileImageUrl || null,
        is_public: fields.isPublic && canPublish,
      }, hasProfile),
    ])
    setSaving(false)

    const error = privateProfileError || athleteProfileError
    if (error) {
      if (uploadedAvatarPath) await supabase.storage.from('athlete-avatars').remove([uploadedAvatarPath])
      return setDetailsStatus({ kind: 'error', key: saveErrorKey(error.message) })
    }

    if (previousAvatarPath && (removeCurrentImage || uploadedAvatarPath)) {
      await supabase.storage.from('athlete-avatars').remove([previousAvatarPath])
    }
    setHasProfile(true)
    setProfileImageUrl(nextProfileImageUrl)
    setSelectedImage(null)
    setImagePreviewUrl('')
    setRemoveCurrentImage(false)
    setSaved(fields)
    setDetailsStatus({ kind: 'success', key: 'saved' })
    router.refresh()
  }

  const addVideo = async () => {
    if (!videoTitle.trim() || !isSupportedVideoUrl(videoUrl)) return setMediaStatus({ kind: 'error', key: 'videoUrl' })
    const { data, error } = await createClient().from('athlete_videos').insert({ athlete_id: userId, title: videoTitle.trim(), video_url: videoUrl.trim(), video_type: videoType }).select().single()
    if (error) return setMediaStatus({ kind: 'error', key: 'clipFailed' })
    setVideos(current => [data as Video, ...current])
    setVideoTitle('')
    setVideoUrl('')
    setVideoType('highlight')
    setMediaStatus({ kind: 'success', key: 'clipAdded' })
  }

  const addAchievement = async () => {
    if (!achievementTitle.trim()) return setAchievementStatus({ kind: 'error', key: 'achievementTitle' })
    const { data, error } = await createClient().from('athlete_achievements').insert({ athlete_id: userId, title: achievementTitle.trim(), event_name: achievementEvent.trim() || null }).select().single()
    if (error) return setAchievementStatus({ kind: 'error', key: 'achievementFailed' })
    setAchievements(current => [data as Achievement, ...current])
    setAchievementTitle('')
    setAchievementEvent('')
    setAchievementStatus({ kind: 'success', key: 'achievementAdded' })
  }

  const addUploadHighlight = async () => {
    if (!highlightTitle.trim() || !highlightFile) return setMediaStatus({ kind: 'error', key: 'highlightNeedFile' })
    if (!ALLOWED_HIGHLIGHT_TYPES.has(highlightFile.type) || highlightFile.size > MAX_HIGHLIGHT_SIZE) return setMediaStatus({ kind: 'error', key: 'highlightType' })
    const mediaType = highlightFile.type.startsWith('video/') ? 'video' : 'image'
    const extension = highlightFile.name.split('.').pop()?.toLowerCase() || (mediaType === 'video' ? 'mp4' : 'jpg')
    const path = `${userId}/highlight-${Date.now()}.${extension}`
    const supabase = createClient()
    setUploading(true)
    const { error: uploadError } = await supabase.storage.from('athlete-highlights').upload(path, highlightFile, {
      cacheControl: '3600', contentType: highlightFile.type, upsert: false,
    })
    if (uploadError) {
      setUploading(false)
      return setMediaStatus({ kind: 'error', key: uploadError.message.includes('Bucket') ? 'storageNotReady' : 'highlightFailed' })
    }
    const { data, error } = await supabase.from('athlete_highlights').insert({
      athlete_id: userId, title: highlightTitle.trim(), media_path: path, media_type: mediaType,
    }).select().single()
    setUploading(false)
    if (error || !data) {
      await supabase.storage.from('athlete-highlights').remove([path])
      return setMediaStatus({ kind: 'error', key: 'highlightFailed' })
    }
    setHighlights(current => [data as UploadedHighlight, ...current])
    setHighlightTitle('')
    setHighlightFile(null)
    setMediaStatus({ kind: 'success', key: 'highlightAdded' })
  }

  const removeItem = async (table: 'athlete_videos' | 'athlete_achievements', id: number) => {
    const { error } = await createClient().from(table).delete().eq('id', id)
    if (error) return (table === 'athlete_videos' ? setMediaStatus : setAchievementStatus)({ kind: 'error', key: 'deleteFailed' })
    if (table === 'athlete_videos') setVideos(current => current.filter(item => item.id !== id))
    else setAchievements(current => current.filter(item => item.id !== id))
  }

  const removeUploadedHighlight = async (highlight: UploadedHighlight) => {
    const supabase = createClient()
    const { error } = await supabase.from('athlete_highlights').delete().eq('id', highlight.id)
    if (error) return setMediaStatus({ kind: 'error', key: 'deleteFailed' })
    await supabase.storage.from('athlete-highlights').remove([highlight.media_path])
    setHighlights(current => current.filter(item => item.id !== highlight.id))
  }

  const input = (id: string, label: string, key: 'displayName' | 'province' | 'team', placeholder: string, help?: string) => (
    <div className="pf-field">
      <label className="pf-label" htmlFor={id}>{label}</label>
      <input id={id} className="pf-input" value={fields[key]} onChange={event => set(key)(event.target.value)} placeholder={placeholder} />
      {help && <span className="pf-help">{help}</span>}
    </div>
  )

  return (
    <>
      <nav className="pf-tabs" aria-label={t('title')}>
        {(['details', 'privacy', 'highlights', 'achievements'] as const).map(id => <a key={id} href={`#${id}`}>{t(`nav.${id}`)}</a>)}
      </nav>

      <div className="pf-main">
        <div className="pf-main">
          <Section id="details" title={t('details.title')} description={t('details.description')}>
            <div className="pf-grid">
              <div className="pf-photo">
                <div className={`pf-photo-frame${displayedImageUrl ? ' has-photo' : ''}`} style={displayedImageUrl ? { backgroundImage: `url(${displayedImageUrl})` } : undefined} aria-hidden="true">
                  {!displayedImageUrl && <ImageIcon size={28} />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="pf-label">{t('details.photo')}</div>
                  <input id="athlete-avatar-upload" className="pf-sr" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} />
                  <div className="pf-row" style={{ marginTop: 8 }}>
                    <label htmlFor="athlete-avatar-upload" className="pf-btn pf-btn-line pf-btn-sm" style={{ cursor: 'pointer' }}><Camera size={16} aria-hidden="true" />{displayedImageUrl ? t('details.changePhoto') : t('details.choosePhoto')}</label>
                    {displayedImageUrl && <button type="button" onClick={clearImage} className="pf-btn-icon" aria-label={t('details.removePhoto')} title={t('details.removePhoto')}><Trash2 size={17} /></button>}
                  </div>
                  <p className="pf-help" style={{ margin: '8px 0 0' }}>{t('details.photoHint')}</p>
                </div>
              </div>

              <div className="pf-grid pf-grid-2">
                {input('pf-display-name', t('details.displayName'), 'displayName', t('details.displayNamePlaceholder'))}
                <div className="pf-field">
                  <label className="pf-label" htmlFor="pf-birth-date">{t('details.birthDate')}{age !== null && <span style={{ color: '#5b6472', fontWeight: 600 }}> · {t('details.ageNow', { age })}</span>}</label>
                  <input id="pf-birth-date" className="pf-input" type="date" value={fields.birthDate} onChange={event => set('birthDate')(event.target.value)} max={thaiDate(new Date())} />
                  <span className="pf-help">{t('details.birthDateHint')}</span>
                </div>
              </div>

              <div className="pf-field">
                <span className="pf-label" id="pf-position-label">{t('details.position')}</span>
                <div className="pf-positions" role="group" aria-labelledby="pf-position-label">
                  {POSITIONS.map(item => <button key={item} type="button" className="pf-position" aria-pressed={fields.position === item} onClick={() => set('position')(item)}><b>{item}</b><span>{t(`details.positions.${item}`)}</span></button>)}
                </div>
              </div>

              <div className="pf-grid pf-grid-2">
                {input('pf-team', t('details.team'), 'team', t('details.teamPlaceholder'))}
                {input('pf-province', t('details.province'), 'province', t('details.provincePlaceholder'))}
              </div>

              <div className="pf-grid pf-grid-2">
                <div className="pf-field">
                  <label className="pf-label" htmlFor="pf-height">{t('details.height')}</label>
                  <input id="pf-height" className="pf-input" type="number" inputMode="numeric" min="80" max="250" value={fields.height} onChange={event => set('height')(event.target.value)} placeholder="165" />
                </div>
                <div className="pf-field">
                  <label className="pf-label" htmlFor="pf-weight">{t('details.weight')}</label>
                  <input id="pf-weight" className="pf-input" type="number" inputMode="decimal" min="20" max="250" value={fields.weight} onChange={event => set('weight')(event.target.value)} placeholder="55" />
                </div>
              </div>

              <div className="pf-field">
                <label className="pf-label" htmlFor="pf-bio">{t('details.bio')}</label>
                <textarea id="pf-bio" className="pf-input" rows={4} value={fields.bio} onChange={event => set('bio')(event.target.value.slice(0, 600))} placeholder={t('details.bioPlaceholder')} />
                <span className="pf-counter">{fields.bio.length}/600</span>
              </div>
            </div>
          </Section>

          <Section id="privacy" title={t('privacy.title')} description={t('privacy.description')}>
            <div className="pf-switch-row">
              <div><b id="pf-public-label">{t('privacy.toggle')}</b><span>{fields.isPublic && canPublish ? t('privacy.on') : t('privacy.off')}</span></div>
              <button type="button" role="switch" className="pf-switch" aria-labelledby="pf-public-label" aria-checked={fields.isPublic && canPublish} disabled={!canPublish} onClick={() => set('isPublic')(!fields.isPublic)} />
            </div>
            {!fields.birthDate && <div className="pf-callout is-warn"><ShieldAlert size={18} aria-hidden="true" style={{ flex: 'none' }} /><span>{t('privacy.needBirthDate')}</span></div>}
            {isMinor && (hasGuardianConsent
              ? <div className="pf-callout is-ok"><CheckCircle2 size={18} aria-hidden="true" style={{ flex: 'none' }} /><span>{t('privacy.minorOk')}</span></div>
              : <div className="pf-callout is-warn"><ShieldAlert size={18} aria-hidden="true" style={{ flex: 'none' }} /><span>{t('privacy.minorWaiting')} <Link href="/guardian">{t('privacy.goGuardian')}</Link></span></div>)}
            {athleteProfile?.verification_level && athleteProfile.verification_level !== 'self' && <div className="pf-callout is-ok"><BadgeCheck size={18} aria-hidden="true" style={{ flex: 'none' }} /><span>{t(`privacy.verified.${athleteProfile.verification_level}`)}</span></div>}
          </Section>

          <div className={`pf-savebar${dirty ? ' is-dirty' : ''}`}>
            {/* A success message stays only until the next edit; an error stays until fixed. */}
            <span role="status" aria-live="polite" className={shownStatus ? `pf-status is-${shownStatus.kind}` : undefined} style={{ margin: 0 }}>{shownStatus ? message(shownStatus.key) : dirty ? t('save.dirty') : t('save.clean')}</span>
            <button type="button" className="pf-btn pf-btn-primary" onClick={saveProfile} disabled={saving || !dirty}>
              {saving ? <Loader2 size={17} className="pf-spin" aria-hidden="true" /> : null}{saving ? t('save.saving') : t('save.button')}
            </button>
          </div>
        </div>

        <Section id="highlights" title={t('highlights.title')} description={t('highlights.description')}>
          <div className="pf-drop">
            <div className="pf-field">
              <label className="pf-label" htmlFor="pf-moment">{t('highlights.momentName')}</label>
              <input id="pf-moment" className="pf-input" value={highlightTitle} onChange={event => setHighlightTitle(event.target.value)} placeholder={t('highlights.momentPlaceholder')} />
            </div>
            <div className="pf-file">
              <input id="pf-highlight-file" className="pf-sr" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={event => setHighlightFile(event.target.files?.[0] || null)} />
              <label htmlFor="pf-highlight-file" className="pf-btn pf-btn-line pf-btn-sm" style={{ cursor: 'pointer' }}><Upload size={16} aria-hidden="true" />{t('highlights.chooseFile')}</label>
              <span className="pf-file-name">{highlightFile ? `${highlightFile.name} · ${(highlightFile.size / 1024 / 1024).toFixed(1)} MB` : ''}</span>
            </div>
            <p className="pf-help" style={{ margin: 0 }}>{t('highlights.fileHint')}</p>
            <div><button type="button" className="pf-btn pf-btn-primary" disabled={uploading} onClick={addUploadHighlight}>{uploading ? <Loader2 size={17} className="pf-spin" aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}{uploading ? t('highlights.uploading') : t('highlights.upload')}</button></div>
          </div>

          <div className="pf-subhead">{t('highlights.linkTitle')}</div>
          <div className="pf-grid">
            <input className="pf-input" aria-label={t('highlights.clipName')} value={videoTitle} onChange={event => setVideoTitle(event.target.value)} placeholder={t('highlights.clipName')} />
            <div className="pf-inline">
              <input className="pf-input" aria-label="URL" value={videoUrl} onChange={event => setVideoUrl(event.target.value)} placeholder="https://" type="url" inputMode="url" />
              <button type="button" className="pf-btn pf-btn-line" onClick={addVideo}><Plus size={17} aria-hidden="true" />{t('highlights.add')}</button>
            </div>
            <div className="pf-types" role="group" aria-label={t('highlights.clipName')}>
              {VIDEO_TYPES.map(type => <button key={type} type="button" className="pf-type" aria-pressed={videoType === type} onClick={() => setVideoType(type)}>{t(`highlights.types.${type}`)}</button>)}
            </div>
          </div>
          <StatusLine status={mediaStatus} text={message} />

          <ul className="pf-list" style={{ marginTop: 8 }}>
            {highlights.length + videos.length === 0 && <li><p className="pf-empty">{t('highlights.empty')}</p></li>}
            {highlights.map(highlight => <li key={`h-${highlight.id}`} style={{ opacity: highlight.moderation_status === 'hidden' ? 0.6 : 1 }}>
              <div className="pf-list-main" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <VideoIcon size={17} color="#CC0001" aria-hidden="true" style={{ flex: 'none' }} />
                <span style={{ minWidth: 0 }}>
                  <a href={`/api/highlights/${highlight.id}/media`} target="_blank" rel="noreferrer" style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{highlight.title}</a>
                  <span>{highlight.moderation_status === 'hidden' ? t('highlights.hidden') : t(highlight.media_type === 'video' ? 'highlights.video' : 'highlights.image')}</span>
                </span>
              </div>
              <button type="button" className="pf-btn-icon" aria-label={t('highlights.remove', { title: highlight.title })} onClick={() => removeUploadedHighlight(highlight)}><Trash2 size={17} /></button>
            </li>)}
            {videos.map(video => <li key={`v-${video.id}`}>
              <div className="pf-list-main" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Link2 size={17} color="#CC0001" aria-hidden="true" style={{ flex: 'none' }} />
                <span style={{ minWidth: 0 }}>
                  <a href={video.video_url} target="_blank" rel="noreferrer" style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{video.title}</a>
                  <span>{t('highlights.link')} · {t(`highlights.types.${video.video_type}`)}</span>
                </span>
              </div>
              <button type="button" className="pf-btn-icon" aria-label={t('highlights.remove', { title: video.title })} onClick={() => removeItem('athlete_videos', video.id)}><Trash2 size={17} /></button>
            </li>)}
          </ul>
        </Section>

        <Section id="achievements" title={t('achievements.title')} description={t('achievements.description')}>
          <div className="pf-grid">
            <input className="pf-input" aria-label={t('achievements.titlePlaceholder')} value={achievementTitle} onChange={event => setAchievementTitle(event.target.value)} placeholder={t('achievements.titlePlaceholder')} />
            <div className="pf-inline">
              <input className="pf-input" aria-label={t('achievements.eventPlaceholder')} value={achievementEvent} onChange={event => setAchievementEvent(event.target.value)} placeholder={t('achievements.eventPlaceholder')} />
              <button type="button" className="pf-btn pf-btn-line" onClick={addAchievement}><Plus size={17} aria-hidden="true" />{t('achievements.add')}</button>
            </div>
          </div>
          <StatusLine status={achievementStatus} text={message} />
          <ul className="pf-list" style={{ marginTop: 8 }}>
            {achievements.length === 0 && <li><p className="pf-empty">{t('achievements.empty')}</p></li>}
            {achievements.map(item => <li key={item.id}>
              <div className="pf-list-main" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Award size={17} color={item.verification_status === 'verified' ? '#15803d' : '#CC0001'} aria-hidden="true" style={{ flex: 'none' }} />
                <span style={{ minWidth: 0 }}>
                  <b>{item.title}</b>
                  <span>{item.event_name || t('achievements.noEvent')} · {item.verification_status === 'verified' ? t('achievements.verified') : t('achievements.unverified')}</span>
                </span>
              </div>
              <button type="button" className="pf-btn-icon" aria-label={t('achievements.remove', { title: item.title })} onClick={() => removeItem('athlete_achievements', item.id)}><Trash2 size={17} /></button>
            </li>)}
          </ul>
        </Section>
      </div>
    </>
  )
}
