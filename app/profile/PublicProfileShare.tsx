'use client'

import { Check, Copy, Lock, Share2 } from 'lucide-react'
import { useState } from 'react'
import { track } from '@vercel/analytics'

export default function PublicProfileShare({ profilePath, isPublic }: { profilePath: string; isPublic: boolean }) {
  const [message, setMessage] = useState('')
  const url = typeof window === 'undefined' ? profilePath : `${window.location.origin}${profilePath}`

  const share = async () => {
    if (!isPublic) return setMessage('เปิด “โปรไฟล์สาธารณะ” และบันทึกก่อน เพื่อรับลิงก์แชร์')
    try {
      if (navigator.share) {
        await navigator.share({ title: 'My BallDoenSai Athlete Profile', text: 'นี่คือเส้นทางนักบอลของฉันบน BallDoenSai.com ⚽', url })
        track('athlete_profile_shared', { method: 'native_share' })
        setMessage('เปิดเมนูแชร์แล้ว')
      } else {
        await navigator.clipboard.writeText(url)
        track('athlete_profile_shared', { method: 'clipboard_fallback' })
        setMessage('คัดลอกลิงก์แล้ว')
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setMessage('ยังแชร์ไม่สำเร็จ ลองคัดลอกลิงก์แทน')
    }
  }

  const copy = async () => {
    if (!isPublic) return setMessage('เปิด “โปรไฟล์สาธารณะ” และบันทึกก่อน เพื่อรับลิงก์แชร์')
    try {
      await navigator.clipboard.writeText(url)
      track('athlete_profile_link_copied')
      setMessage('คัดลอกลิงก์แล้ว')
    } catch { setMessage('คัดลอกไม่สำเร็จ ลองกดแชร์จากมือถือ') }
  }

  return <section style={{ background: '#101827', color: 'white', padding: 18, marginBottom: 20, position: 'relative', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', width: 160, height: 160, borderRadius: '50%', border: '1px solid rgba(244,185,66,.3)', right: -55, top: -82 }} />
    <div style={{ position: 'relative' }}><span style={{ color: '#f4c861', fontFamily: 'var(--font-barlow)', fontSize: 10, letterSpacing: 1.1, fontWeight: 800 }}>SHARE YOUR STORY</span><b style={{ display: 'block', fontSize: 17, marginTop: 4 }}>โปรไฟล์นักบอลของคุณ พร้อมแชร์แล้ว</b><p style={{ color: 'rgba(255,255,255,.66)', fontSize: 11, lineHeight: 1.5, marginTop: 5 }}>{isPublic ? 'เมื่อแชร์ลง Story หรือ Facebook จะมีภาพ Preview การ์ดของคุณอัตโนมัติ' : 'โปรไฟล์ยังเป็นส่วนตัว เพื่อความปลอดภัยของข้อมูลคุณ'}</p></div>
    <div style={{ position: 'relative', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}><button type="button" onClick={share} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, background: '#d71920', color: 'white', padding: '10px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>{isPublic ? <Share2 size={15} /> : <Lock size={15} />}{isPublic ? 'แชร์โปรไฟล์' : 'ยังแชร์ไม่ได้'}</button><button type="button" onClick={copy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid rgba(255,255,255,.32)', background: 'transparent', color: 'white', padding: '9px 11px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>{message === 'คัดลอกลิงก์แล้ว' ? <Check size={15} /> : <Copy size={15} />} คัดลอกลิงก์</button></div>
    {message && <small style={{ position: 'relative', display: 'block', color: '#f4c861', marginTop: 9 }}>{message}</small>}
  </section>
}
