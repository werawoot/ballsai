'use client'

import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  Award,
  Camera,
  CalendarDays,
  CheckCircle2,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Link2,
  Loader2,
  MapPin,
  Plus,
  Ruler,
  Save,
  ShieldCheck,
  Trash2,
  User,
  Users,
  Video as VideoIcon,
  Weight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'

type ProfileForm = {
  full_name?: string | null
  province?: string | null
  team?: string | null
  position?: string | null
  phone?: string | null
}

type AthleteProfileForm = {
  display_name: string
  birth_date?: string | null
  sport: string
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

type Video = {
  id: number
  title: string
  video_url: string
  video_type: 'highlight' | 'match' | 'training'
}

type Achievement = {
  id: number
  title: string
  event_name?: string | null
  achievement_year?: number | null
  proof_url?: string | null
  verification_status: 'unverified' | 'pending' | 'verified' | 'rejected'
}

type UploadedHighlight = {
  id: number
  title: string
  media_path: string
  media_type: 'image' | 'video'
}

type FieldProps = {
  icon: ReactNode
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: string
  min?: string
  max?: string
}

const MAX_AVATAR_SIZE = 5 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_HIGHLIGHT_SIZE = 25 * 1024 * 1024
const ALLOWED_HIGHLIGHT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
const VIDEO_TYPE_LABELS: Record<Video['video_type'], string> = {
  highlight: 'ไฮไลต์',
  match: 'การแข่งขัน',
  training: 'การฝึกซ้อม',
}

function isSupportedVideoUrl(value: string) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return url.protocol === 'https:' && (
      host === 'youtu.be'
      || host === 'youtube.com'
      || host.endsWith('.youtube.com')
      || host === 'tiktok.com'
      || host.endsWith('.tiktok.com')
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

const inputStyle = {
  width: '100%',
  minHeight: 44,
  border: '1.5px solid #e5e5e5',
  borderRadius: 8,
  padding: '10px 12px 10px 38px',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'var(--font-sarabun)',
  color: '#111',
  background: '#fafafa',
} as const

function Field({ icon, label, value, onChange, placeholder, type = 'text', min, max }: FieldProps) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#666', marginBottom: 6 }}>{label}</span>
      <span style={{ position: 'relative', display: 'block' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#999', display: 'flex' }}>{icon}</span>
        <input type={type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} min={min} max={max} style={inputStyle} />
      </span>
    </label>
  )
}

function sectionTitle(icon: ReactNode, title: string, description: string) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
      <span style={{ width: 32, height: 32, borderRadius: 8, background: '#fff1f1', color: '#CC0001', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <span>
        <span style={{ display: 'block', fontFamily: 'var(--font-oswald)', fontSize: 16, fontWeight: 700, color: '#111' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 11, color: '#888', marginTop: 2 }}>{description}</span>
      </span>
    </div>
  )
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
  const router = useRouter()
  const [displayName, setDisplayName] = useState(athleteProfile?.display_name || profile?.full_name || '')
  const [birthDate, setBirthDate] = useState(athleteProfile?.birth_date ?? '')
  const [province, setProvince] = useState(athleteProfile?.province || profile?.province || '')
  const [team, setTeam] = useState(athleteProfile?.current_team || profile?.team || '')
  const [position, setPosition] = useState(athleteProfile?.position || profile?.position || '')
  const [height, setHeight] = useState(athleteProfile?.height_cm?.toString() ?? '')
  const [weight, setWeight] = useState(athleteProfile?.weight_kg?.toString() ?? '')
  const [bio, setBio] = useState(athleteProfile?.bio ?? '')
  const [profileImageUrl, setProfileImageUrl] = useState(athleteProfile?.profile_image_url ?? '')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
  const [removeCurrentImage, setRemoveCurrentImage] = useState(false)
  const [isPublic, setIsPublic] = useState(athleteProfile?.is_public ?? false)
  const [hasGuardianConsent, setHasGuardianConsent] = useState(Boolean(athleteProfile?.guardian_consent_at))
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
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    return () => {
      if (imagePreviewUrl.startsWith('blob:')) URL.revokeObjectURL(imagePreviewUrl)
    }
  }, [imagePreviewUrl])

  const age = useMemo(() => {
    if (!birthDate) return null
    const birth = new Date(`${birthDate}T00:00:00`)
    if (Number.isNaN(birth.getTime())) return null
    const now = new Date()
    let years = now.getFullYear() - birth.getFullYear()
    if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) years -= 1
    return years
  }, [birthDate])

  const isMinor = age !== null && age < 20
  const canPublish = Boolean(birthDate) && (!isMinor || hasGuardianConsent)
  const displayedImageUrl = imagePreviewUrl || (removeCurrentImage ? '' : profileImageUrl)
  const completedFields = [displayName, birthDate, province, team, position, height, weight, bio, displayedImageUrl].filter(Boolean).length
  const completionPercentage = Math.round((completedFields / 9) * 100)

  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setMessage({ kind: 'error', text: 'รองรับเฉพาะรูป JPG, PNG หรือ WEBP' })
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setMessage({ kind: 'error', text: 'รูปโปรไฟล์ต้องมีขนาดไม่เกิน 5 MB' })
      return
    }
    setMessage(null)
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
    setMessage(null)
    if (!displayName.trim() || !birthDate) {
      setMessage({ kind: 'error', text: 'กรุณากรอกชื่อและวันเกิดก่อนบันทึก' })
      return
    }
    if (isPublic && !canPublish) {
      setMessage({ kind: 'error', text: 'โปรไฟล์ผู้เยาว์ต้องได้รับความยินยอมจากผู้ปกครองก่อนเผยแพร่' })
      return
    }

    const supabase = createClient()
    setLoading(true)
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
        setLoading(false)
        setMessage({ kind: 'error', text: uploadError.message.includes('Bucket') ? 'กรุณา Apply SQL Athlete Profile V2 เพื่อสร้างพื้นที่เก็บรูปก่อน' : `อัปโหลดรูปไม่สำเร็จ: ${uploadError.message}` })
        return
      }
      nextProfileImageUrl = supabase.storage.from('athlete-avatars').getPublicUrl(uploadedAvatarPath).data.publicUrl
    }

    const [{ error: privateProfileError }, { error: athleteProfileError }] = await Promise.all([
      supabase.from('profiles').upsert({
        id: userId,
        full_name: displayName.trim(),
        province: province.trim(),
        team: team.trim(),
        position,
      }),
      supabase.from('athlete_profiles').upsert({
        user_id: userId,
        display_name: displayName.trim(),
        birth_date: birthDate,
        sport: 'football',
        position: position || null,
        province: province.trim() || null,
        height_cm: height ? Number(height) : null,
        weight_kg: weight ? Number(weight) : null,
        current_team: team.trim() || null,
        bio: bio.trim() || null,
        profile_image_url: nextProfileImageUrl || null,
        guardian_consent_at: hasGuardianConsent ? athleteProfile?.guardian_consent_at || new Date().toISOString() : null,
        is_public: isPublic && canPublish,
      }, { onConflict: 'user_id' }),
    ])
    setLoading(false)

    const error = privateProfileError || athleteProfileError
    if (error) {
      if (uploadedAvatarPath) await supabase.storage.from('athlete-avatars').remove([uploadedAvatarPath])
      setMessage({ kind: 'error', text: error.message.includes('athlete_profiles') ? 'กรุณา Apply SQL Athlete Profile V2 ใน Supabase ก่อน' : error.message })
      return
    }

    if (previousAvatarPath && (removeCurrentImage || uploadedAvatarPath)) {
      await supabase.storage.from('athlete-avatars').remove([previousAvatarPath])
    }
    setProfileImageUrl(nextProfileImageUrl)
    setSelectedImage(null)
    setImagePreviewUrl('')
    setRemoveCurrentImage(false)
    setMessage({ kind: 'success', text: 'บันทึกโปรไฟล์นักกีฬาแล้ว' })
    router.refresh()
  }

  const addVideo = async () => {
    if (!videoTitle.trim() || !isSupportedVideoUrl(videoUrl)) {
      setMessage({ kind: 'error', text: 'กรุณาใส่ลิงก์ YouTube หรือ TikTok ที่ถูกต้อง' })
      return
    }
    const supabase = createClient()
    const { data, error } = await supabase.from('athlete_videos').insert({ athlete_id: userId, title: videoTitle.trim(), video_url: videoUrl.trim(), video_type: videoType }).select().single()
    if (error) return setMessage({ kind: 'error', text: 'บันทึกคลิปไม่สำเร็จ กรุณาบันทึกโปรไฟล์ก่อน' })
    setVideos(current => [data as Video, ...current])
    setVideoTitle('')
    setVideoUrl('')
    setVideoType('highlight')
  }

  const addAchievement = async () => {
    if (!achievementTitle.trim()) return setMessage({ kind: 'error', text: 'กรุณาใส่ชื่อผลงาน' })
    const supabase = createClient()
    const { data, error } = await supabase.from('athlete_achievements').insert({ athlete_id: userId, title: achievementTitle.trim(), event_name: achievementEvent.trim() || null }).select().single()
    if (error) return setMessage({ kind: 'error', text: 'บันทึกผลงานไม่สำเร็จ กรุณาบันทึกโปรไฟล์ก่อน' })
    setAchievements(current => [data as Achievement, ...current])
    setAchievementTitle('')
    setAchievementEvent('')
  }

  const addUploadHighlight = async () => {
    if (!highlightTitle.trim() || !highlightFile) {
      setMessage({ kind: 'error', text: 'กรุณาใส่ชื่อ Highlight และเลือกไฟล์ก่อน' })
      return
    }
    if (!ALLOWED_HIGHLIGHT_TYPES.has(highlightFile.type) || highlightFile.size > MAX_HIGHLIGHT_SIZE) {
      setMessage({ kind: 'error', text: 'รองรับ JPG, PNG, WEBP, MP4 หรือ WEBM ขนาดไม่เกิน 25 MB' })
      return
    }
    const mediaType = highlightFile.type.startsWith('video/') ? 'video' : 'image'
    const extension = highlightFile.name.split('.').pop()?.toLowerCase() || (mediaType === 'video' ? 'mp4' : 'jpg')
    const path = `${userId}/highlight-${Date.now()}.${extension}`
    const supabase = createClient()
    setLoading(true)
    const { error: uploadError } = await supabase.storage.from('athlete-highlights').upload(path, highlightFile, {
      cacheControl: '3600', contentType: highlightFile.type, upsert: false,
    })
    if (uploadError) {
      setLoading(false)
      setMessage({ kind: 'error', text: uploadError.message.includes('Bucket') ? 'กรุณา Apply SQL Athlete Highlight Uploads V1 ก่อน' : `อัปโหลด Highlight ไม่สำเร็จ: ${uploadError.message}` })
      return
    }
    const { data, error } = await supabase.from('athlete_highlights').insert({
      athlete_id: userId, title: highlightTitle.trim(), media_path: path, media_type: mediaType,
    }).select().single()
    setLoading(false)
    if (error || !data) {
      await supabase.storage.from('athlete-highlights').remove([path])
      setMessage({ kind: 'error', text: 'บันทึก Highlight ไม่สำเร็จ กรุณาบันทึก Athlete Profile ก่อน' })
      return
    }
    setHighlights(current => [data as UploadedHighlight, ...current])
    setHighlightTitle('')
    setHighlightFile(null)
    setMessage({ kind: 'success', text: 'เพิ่ม Highlight แล้ว' })
  }

  const removeItem = async (table: 'athlete_videos' | 'athlete_achievements', id: number) => {
    const { error } = await createClient().from(table).delete().eq('id', id)
    if (error) return setMessage({ kind: 'error', text: 'ลบข้อมูลไม่สำเร็จ' })
    if (table === 'athlete_videos') setVideos(current => current.filter(item => item.id !== id))
    else setAchievements(current => current.filter(item => item.id !== id))
  }

  const removeUploadedHighlight = async (highlight: UploadedHighlight) => {
    const supabase = createClient()
    const { error } = await supabase.from('athlete_highlights').delete().eq('id', highlight.id)
    if (error) return setMessage({ kind: 'error', text: 'ลบ Highlight ไม่สำเร็จ' })
    await supabase.storage.from('athlete-highlights').remove([highlight.media_path])
    setHighlights(current => current.filter(item => item.id !== highlight.id))
  }

  return (
    <div style={{ background: 'white', border: '1.5px solid #e5e5e5', borderRadius: 8, overflow: 'hidden' }}>
      <section style={{ padding: 18, borderBottom: '1px solid #eee' }}>
        {sectionTitle(<User size={18} />, 'Athlete Profile', 'ข้อมูลที่ใช้สร้างการ์ดและโปรไฟล์สาธารณะ')}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 10, fontWeight: 800, color: '#777' }}><span>ความสมบูรณ์ของโปรไฟล์</span><span>{completionPercentage}%</span></div>
          <div style={{ height: 5, background: '#eee', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${completionPercentage}%`, height: '100%', background: completionPercentage === 100 ? '#15803d' : '#CC0001', transition: 'width .25s ease' }} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '88px minmax(0,1fr)', gap: 14, alignItems: 'start', marginBottom: 16 }}>
          <div style={{ width: 88, aspectRatio: '3/4', borderRadius: 8, background: displayedImageUrl ? `url(${displayedImageUrl}) center/cover` : '#f1f1f1', border: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
            {!displayedImageUrl && <ImageIcon size={28} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#555', marginBottom: 7 }}>รูปนักกีฬา</div>
            <input id="athlete-avatar-upload" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }} />
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <label htmlFor="athlete-avatar-upload" style={{ minHeight: 38, padding: '0 12px', borderRadius: 7, background: '#111', color: 'white', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}><Camera size={15} />{displayedImageUrl ? 'เปลี่ยนรูป' : 'เลือกรูป'}</label>
              {displayedImageUrl && <button type="button" onClick={clearImage} title="ลบรูปโปรไฟล์" style={{ width: 38, minHeight: 38, border: '1px solid #ddd', borderRadius: 7, background: 'white', color: '#999', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Trash2 size={15} /></button>}
            </div>
            <div style={{ fontSize: 10, color: '#999', lineHeight: 1.5, marginTop: 7 }}>JPG, PNG หรือ WEBP<br />ไม่เกิน 5 MB</div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <Field icon={<User size={16} />} label="ชื่อที่แสดง" value={displayName} onChange={setDisplayName} placeholder="ชื่อ-นามสกุล" />
          <Field icon={<CalendarDays size={16} />} label="วันเกิด" value={birthDate} onChange={setBirthDate} placeholder="" type="date" max={new Date().toISOString().slice(0, 10)} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field icon={<Ruler size={16} />} label="ส่วนสูง (ซม.)" value={height} onChange={setHeight} placeholder="170" type="number" min="80" max="250" />
            <Field icon={<Weight size={16} />} label="น้ำหนัก (กก.)" value={weight} onChange={setWeight} placeholder="60" type="number" min="20" max="250" />
          </div>
          <Field icon={<MapPin size={16} />} label="จังหวัด" value={province} onChange={setProvince} placeholder="กรุงเทพมหานคร" />
          <Field icon={<Users size={16} />} label="ทีม/สโมสรปัจจุบัน" value={team} onChange={setTeam} placeholder="Bangkok FC" />
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#666', marginBottom: 7 }}>ตำแหน่ง</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7 }}>
              {['FW', 'MF', 'DF', 'GK'].map(item => <button key={item} type="button" onClick={() => setPosition(item)} style={{ minHeight: 40, borderRadius: 8, border: `1.5px solid ${position === item ? '#CC0001' : '#ddd'}`, background: position === item ? '#CC0001' : 'white', color: position === item ? 'white' : '#555', fontWeight: 800, cursor: 'pointer' }}>{item}</button>)}
            </div>
          </div>
          <label>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#666', marginBottom: 6 }}>แนะนำตัว</span>
            <textarea value={bio} onChange={event => setBio(event.target.value.slice(0, 600))} rows={4} placeholder="เป้าหมาย จุดเด่น และประสบการณ์ของคุณ" style={{ ...inputStyle, padding: 12, resize: 'vertical' }} />
            <span style={{ display: 'block', textAlign: 'right', fontSize: 10, color: '#aaa', marginTop: 4 }}>{bio.length}/600</span>
          </label>
        </div>
      </section>

      <section style={{ padding: 18, borderBottom: '1px solid #eee' }}>
        {sectionTitle(<VideoIcon size={18} />, 'Highlight Moments', 'อัปโหลดรูป/วิดีโอของคุณ หรือใช้ลิงก์ YouTube และ TikTok')}
        <div style={{ background: '#f7f7f5', border: '1px dashed #cfc9bd', padding: 11, marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 44px', gap: 8 }}><input value={highlightTitle} onChange={event => setHighlightTitle(event.target.value)} placeholder="ชื่อโมเมนต์ เช่น ประตูแรกของฤดูกาล" style={{ ...inputStyle, padding: '10px 12px' }} /><button type="button" title="อัปโหลด Highlight" disabled={loading} onClick={addUploadHighlight} style={{ border: 0, borderRadius: 8, background: '#CC0001', color: 'white', display: 'grid', placeItems: 'center', cursor: loading ? 'wait' : 'pointer' }}><Plus size={18} /></button></div>
          <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={event => setHighlightFile(event.target.files?.[0] || null)} style={{ width: '100%', fontSize: 11, marginTop: 8 }} />
          <small style={{ display: 'block', color: '#777', marginTop: 7, lineHeight: 1.45 }}>{highlightFile ? `${highlightFile.name} · ${(highlightFile.size / 1024 / 1024).toFixed(1)} MB` : 'JPG, PNG, WEBP, MP4 หรือ WEBM · ไม่เกิน 25 MB'}<br />ไฟล์จะเป็นส่วนตัว จนกว่าคุณจะเปิดโปรไฟล์สาธารณะ</small>
        </div>
        {highlights.map(highlight => <div key={highlight.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid #eee' }}><VideoIcon size={15} color="#CC0001" /><div style={{ flex: 1, minWidth: 0 }}><a href={`/api/highlights/${highlight.id}/media`} target="_blank" rel="noreferrer" style={{ display: 'block', color: '#222', fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{highlight.title}</a><span style={{ fontSize: 9, color: '#999' }}>{highlight.media_type === 'video' ? 'วิดีโอที่อัปโหลด' : 'รูปที่อัปโหลด'}</span></div><button type="button" title="ลบ Highlight" onClick={() => removeUploadedHighlight(highlight)} style={{ border: 0, background: 'transparent', color: '#aaa', cursor: 'pointer', display: 'flex' }}><Trash2 size={16} /></button></div>)}
        <div style={{ borderTop: highlights.length ? '1px solid #eee' : 0, marginTop: highlights.length ? 4 : 0, paddingTop: highlights.length ? 14 : 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#777', marginBottom: 8 }}>หรือเพิ่มจากลิงก์</div>
        <div style={{ display: 'grid', gap: 8 }}>
          <input value={videoTitle} onChange={event => setVideoTitle(event.target.value)} placeholder="ชื่อคลิป" style={{ ...inputStyle, padding: '10px 12px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 44px', gap: 8 }}>
            <input value={videoUrl} onChange={event => setVideoUrl(event.target.value)} placeholder="https://..." type="url" style={{ ...inputStyle, padding: '10px 12px' }} />
            <button type="button" title="เพิ่มคลิป" onClick={addVideo} style={{ border: 0, borderRadius: 8, background: '#111', color: 'white', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Plus size={18} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
            {(Object.keys(VIDEO_TYPE_LABELS) as Video['video_type'][]).map(type => <button key={type} type="button" onClick={() => setVideoType(type)} style={{ minHeight: 36, borderRadius: 7, border: `1px solid ${videoType === type ? '#CC0001' : '#ddd'}`, background: videoType === type ? '#fff1f1' : 'white', color: videoType === type ? '#a40000' : '#666', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>{VIDEO_TYPE_LABELS[type]}</button>)}
          </div>
          {videos.map(video => <div key={video.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid #eee' }}><Link2 size={15} color="#CC0001" /><div style={{ flex: 1, minWidth: 0 }}><a href={video.video_url} target="_blank" rel="noreferrer" style={{ display: 'block', color: '#222', fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{video.title}</a><span style={{ fontSize: 9, color: '#999' }}>{VIDEO_TYPE_LABELS[video.video_type]}</span></div><button type="button" title="ลบคลิป" onClick={() => removeItem('athlete_videos', video.id)} style={{ border: 0, background: 'transparent', color: '#aaa', cursor: 'pointer', display: 'flex' }}><Trash2 size={16} /></button></div>)}
        </div>
        </div>
      </section>

      <section style={{ padding: 18, borderBottom: '1px solid #eee' }}>
        {sectionTitle(<Award size={18} />, 'Achievements', 'บันทึกผลงานก่อนส่งหลักฐานเพื่อรับการยืนยัน')}
        <div style={{ display: 'grid', gap: 8 }}>
          <input value={achievementTitle} onChange={event => setAchievementTitle(event.target.value)} placeholder="ชื่อผลงานหรือรางวัล" style={{ ...inputStyle, padding: '10px 12px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 44px', gap: 8 }}>
            <input value={achievementEvent} onChange={event => setAchievementEvent(event.target.value)} placeholder="ชื่อรายการแข่งขัน" style={{ ...inputStyle, padding: '10px 12px' }} />
            <button type="button" title="เพิ่มผลงาน" onClick={addAchievement} style={{ border: 0, borderRadius: 8, background: '#111', color: 'white', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Plus size={18} /></button>
          </div>
          {achievements.map(item => <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid #eee' }}><Award size={15} color={item.verification_status === 'verified' ? '#15803d' : '#CC0001'} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{item.title}</div><div style={{ fontSize: 10, color: '#888' }}>{item.event_name || 'ยังไม่ระบุรายการ'} · {item.verification_status === 'verified' ? 'ยืนยันแล้ว' : 'ยังไม่ยืนยัน'}</div></div><button type="button" title="ลบผลงาน" onClick={() => removeItem('athlete_achievements', item.id)} style={{ border: 0, background: 'transparent', color: '#aaa', cursor: 'pointer', display: 'flex' }}><Trash2 size={16} /></button></div>)}
        </div>
      </section>

      <section style={{ padding: 18 }}>
        {sectionTitle(<ShieldCheck size={18} />, 'Privacy & Publishing', 'เบอร์โทรจะไม่แสดงในโปรไฟล์สาธารณะ')}
        {isMinor && <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, background: '#fff8e6', border: '1px solid #f4d98b', borderRadius: 8, marginBottom: 10, cursor: 'pointer' }}><input type="checkbox" checked={hasGuardianConsent} onChange={event => setHasGuardianConsent(event.target.checked)} style={{ marginTop: 3 }} /><span style={{ fontSize: 12, color: '#624a00', lineHeight: 1.5 }}>ฉันยืนยันว่าได้รับความยินยอมจากผู้ปกครองให้เผยแพร่โปรไฟล์นักกีฬานี้แล้ว</span></label>}
        <button type="button" onClick={() => canPublish && setIsPublic(value => !value)} disabled={!canPublish} style={{ width: '100%', minHeight: 48, border: `1.5px solid ${isPublic ? '#15803d' : '#ddd'}`, borderRadius: 8, background: isPublic ? '#f0fdf4' : '#fafafa', color: isPublic ? '#166534' : '#666', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', cursor: canPublish ? 'pointer' : 'not-allowed', opacity: canPublish ? 1 : 0.55 }}><span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 800 }}>{isPublic ? <Eye size={18} /> : <EyeOff size={18} />}{isPublic ? 'เผยแพร่โปรไฟล์แล้ว' : 'โปรไฟล์ยังเป็นส่วนตัว'}</span><span style={{ fontSize: 10 }}>{canPublish ? 'แตะเพื่อเปลี่ยน' : 'กรอกวันเกิดและความยินยอม'}</span></button>

        {athleteProfile?.verification_level && athleteProfile.verification_level !== 'self' && <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, color: '#166534', fontSize: 12, fontWeight: 700 }}><CheckCircle2 size={16} />{athleteProfile.verification_level === 'coach_verified' ? 'ยืนยันโดยโค้ช' : 'ยืนยันจากผลงานการแข่งขัน'}</div>}
        {message && <div role="status" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: message.kind === 'success' ? '#f0fdf4' : '#fff1f1', color: message.kind === 'success' ? '#166534' : '#a40000' }}>{message.text}</div>}
        <button type="button" onClick={saveProfile} disabled={loading} style={{ width: '100%', minHeight: 48, marginTop: 12, border: 0, borderRadius: 8, background: loading ? '#aaa' : '#CC0001', color: 'white', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: loading ? 'wait' : 'pointer' }}>{loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={18} />}{loading ? 'กำลังบันทึก...' : 'บันทึก Athlete Profile'}</button>
      </section>
    </div>
  )
}
