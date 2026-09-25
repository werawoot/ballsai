'use client'

import { useRef, useState } from 'react'
import { Check, HeartHandshake, Link2, ShieldCheck, X } from 'lucide-react'
import { requestErrorText, requestJson, shouldStartAction } from '@/lib/pending-action'

export type GuardianLink = {
  id: string
  status: 'pending' | 'accepted' | 'declined' | 'revoked'
  requested_at: string
  athlete?: { display_name: string; is_public: boolean; progress?: { xp_total: number; current_level: number } | null; badge_count?: number } | null
}

export default function GuardianLinksClient({ isGuardian, links, incoming }: { isGuardian: boolean; links: GuardianLink[]; incoming: GuardianLink[] }) {
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [myLinks, setMyLinks] = useState(links)
  const [requests, setRequests] = useState(incoming)
  // This screen records guardian consent for a minor, so a stuck button or a
  // silently duplicated request is not acceptable. `disabled={busy}` only guards
  // the next render; this refuses the second click immediately.
  const inFlight = useRef<string | null>(null)

  const requestLink = async () => {
    if (!shouldStartAction(inFlight.current)) return
    inFlight.current = 'request'
    setBusy(true); setMessage('')
    try {
      const outcome = await requestJson('/api/guardian-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ athleteEmail: email, consent }) })
      if (!outcome.ok) {
        // The request may already have been created and the athlete already notified.
        setMessage(requestErrorText(outcome, { fallback: 'ส่งคำขอไม่สำเร็จ', mutating: true }))
        return
      }
      setMessage('ส่งคำขอแล้ว รอให้นักกีฬาตอบรับในบัญชีของเขา')
      setEmail(''); setConsent(false)
    } finally {
      setBusy(false)
      inFlight.current = null
    }
  }

  const respond = async (id: string, status: 'accepted' | 'declined') => {
    if (!shouldStartAction(inFlight.current)) return
    inFlight.current = id
    setBusy(true); setMessage('')
    try {
      const outcome = await requestJson(`/api/guardian-links/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
      if (!outcome.ok) {
        // This guardian-link flow records its consent through the RPC on acceptance.
        // If the response is lost, do not claim success or flip the local card.
        setMessage(requestErrorText(outcome, { fallback: 'อัปเดตคำขอไม่สำเร็จ', mutating: true }))
        return
      }
      setRequests(items => items.map(item => item.id === id ? { ...item, status } : item))
      setMessage(status === 'accepted' ? 'เชื่อมบัญชีผู้ปกครองแล้ว' : 'ปฏิเสธคำขอแล้ว')
    } finally {
      setBusy(false)
      inFlight.current = null
    }
  }

  const revoke = async (id: string) => {
    // `revoke_guardian_link` clears `guardian_consent_at` AND sets `is_public = false`
    // when no other accepted, consented link remains for that athlete. This tab only
    // sees this guardian's own links, so it cannot tell whether another guardian still
    // has one -- say what may happen rather than promising either way.
    const confirmed = window.confirm(
      'ยกเลิกการเชื่อมบัญชีผู้ปกครอง?\n\n' +
      'หากนี่เป็นลิงก์ผู้ปกครองที่ยอมรับรายสุดท้ายของนักกีฬาคนนี้ ความยินยอมของผู้ปกครองจะถูกลบ ' +
      'และโปรไฟล์สาธารณะของนักกีฬาจะถูกปิดทันที ต้องมีผู้ปกครองยืนยันใหม่ก่อนจึงเปิดสาธารณะได้อีกครั้ง',
    )
    if (!confirmed) return

    if (!shouldStartAction(inFlight.current)) return
    inFlight.current = id
    setBusy(true); setMessage('')
    try {
      const outcome = await requestJson(`/api/guardian-links/${id}`, { method: 'DELETE' })
      if (!outcome.ok) {
        // Revoking may remove the effective guardian consent when no other accepted
        // link remains. Do not show it as revoked when the response is lost.
        setMessage(requestErrorText(outcome, { fallback: 'ยกเลิกการเชื่อมบัญชีไม่สำเร็จ', mutating: true }))
        return
      }
      setMyLinks(items => items.map(item => item.id === id ? { ...item, status: 'revoked' } : item))
      setMessage('ยกเลิกการเชื่อมบัญชีแล้ว · หากนี่เป็นลิงก์ผู้ปกครองที่ยอมรับรายสุดท้าย ความยินยอมถูกลบและโปรไฟล์สาธารณะของนักกีฬาถูกปิดแล้ว')
    } finally {
      setBusy(false)
      inFlight.current = null
    }
  }

  const card = (link: GuardianLink, incomingCard = false) => {
    const athlete = link.athlete
    const statusText = link.status === 'accepted' ? 'เชื่อมแล้ว' : link.status === 'pending' ? 'รอตอบรับ' : link.status === 'declined' ? 'ปฏิเสธแล้ว' : 'ยกเลิกแล้ว'
    return <article key={link.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: 15 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><div><b style={{ fontSize: 15 }}>{athlete?.display_name ?? (incomingCard ? 'คำขอจากผู้ปกครอง' : 'นักกีฬา')}</b><p style={{ margin: '4px 0 0', color: '#777', fontSize: 12 }}>{statusText}</p></div><span style={{ color: link.status === 'accepted' ? '#15803d' : '#a16207', background: link.status === 'accepted' ? '#dcfce7' : '#fef3c7', height: 'fit-content', borderRadius: 20, padding: '4px 9px', fontSize: 10, fontWeight: 800 }}>{statusText}</span></div>
      {link.status === 'accepted' && athlete && <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><div style={{ flex: 1, background: '#f7f7f5', padding: 9, borderRadius: 9 }}><small style={{ color: '#888' }}>LEVEL</small><b style={{ display: 'block', fontSize: 18 }}>{athlete.progress?.current_level ?? 1}</b></div><div style={{ flex: 1, background: '#f7f7f5', padding: 9, borderRadius: 9 }}><small style={{ color: '#888' }}>XP</small><b style={{ display: 'block', fontSize: 18 }}>{athlete.progress?.xp_total?.toLocaleString() ?? 0}</b></div><div style={{ flex: 1, background: '#f7f7f5', padding: 9, borderRadius: 9 }}><small style={{ color: '#888' }}>BADGES</small><b style={{ display: 'block', fontSize: 18 }}>{athlete.badge_count ?? 0}</b></div></div>}
      {incomingCard && link.status === 'pending' && <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button disabled={busy} onClick={() => respond(link.id, 'accepted')} style={{ flex: 1, border: 0, background: '#15803d', color: 'white', borderRadius: 9, padding: 10, fontWeight: 800 }}><Check size={15} /> รับคำขอ</button><button disabled={busy} onClick={() => respond(link.id, 'declined')} style={{ flex: 1, border: '1px solid #fecaca', background: 'white', color: '#b91c1c', borderRadius: 9, padding: 10, fontWeight: 800 }}><X size={15} /> ปฏิเสธ</button></div>}
      {!incomingCard && link.status === 'accepted' && <button disabled={busy} onClick={() => revoke(link.id)} style={{ border: 0, background: 'transparent', color: '#b91c1c', fontSize: 12, fontWeight: 800, padding: '12px 0 0' }}>ยกเลิกการเชื่อมบัญชี</button>}
    </article>
  }

  return <div style={{ display: 'grid', gap: 16 }}>
    {isGuardian && <section style={{ background: '#101827', color: 'white', borderRadius: 16, padding: 18 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><HeartHandshake size={20} color="#f5c518" /><b>เชื่อมกับนักกีฬา</b></div><p style={{ color: 'rgba(255,255,255,.72)', fontSize: 13, lineHeight: 1.55 }}>ใช้เฉพาะอีเมลที่นักกีฬาใช้เข้าสู่ BallDoenSai ผู้ปกครองต้องยืนยันความยินยอมก่อนส่งคำขอ และนักกีฬาจะเป็นผู้ตอบรับ</p><input value={email} onChange={event => setEmail(event.target.value)} type="email" placeholder="อีเมลบัญชีนักกีฬา" style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.08)', color: 'white', borderRadius: 9 }} /><label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '12px 0', fontSize: 12, lineHeight: 1.45, color: 'rgba(255,255,255,.82)' }}><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />ฉันเป็นผู้ปกครองหรือผู้มีอำนาจดูแล และยินยอมให้ BallDoenSai แสดงข้อมูลความก้าวหน้าของนักกีฬาบัญชีนี้แก่ฉัน</label><button disabled={busy || !email || !consent} onClick={requestLink} style={{ width: '100%', border: 0, borderRadius: 9, padding: 11, background: '#f5c518', color: '#101827', fontWeight: 900 }}>{busy ? 'กำลังส่ง...' : 'ส่งคำขอเชื่อมบัญชี'}</button></section>}
    {isGuardian && <section><h2 style={{ fontSize: 17, marginBottom: 10 }}><Link2 size={18} /> นักกีฬาที่เชื่อมแล้ว</h2><div style={{ display: 'grid', gap: 10 }}>{myLinks.length ? myLinks.map(link => card(link)) : <p style={{ color: '#888', fontSize: 13 }}>ยังไม่มีนักกีฬาที่เชื่อมบัญชี</p>}</div></section>}
    {requests.length > 0 && <section><h2 style={{ fontSize: 17, marginBottom: 10 }}><ShieldCheck size={18} /> คำขอผู้ปกครองที่รอการตอบรับ</h2><div style={{ display: 'grid', gap: 10 }}>{requests.map(link => card(link, true))}</div></section>}
    {message && <p role="status" style={{ margin: 0, padding: 12, borderRadius: 10, background: message.includes('ไม่สำเร็จ') ? '#fff1f1' : '#f0fdf4', color: message.includes('ไม่สำเร็จ') ? '#b91c1c' : '#166534', fontSize: 13 }}>{message}</p>}
  </div>
}
