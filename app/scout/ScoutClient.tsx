'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Bookmark, MapPin, Search, SlidersHorizontal, X } from 'lucide-react'
import { requestJson, requestErrorText } from '@/lib/pending-action'
import { EMPTY_ATTEMPT_LEDGER, EMPTY_SHORTLIST_RECOVERY, canReloadRow, canWriteRow, failCheck, isChecking, isLatestAttempt, markOutcomeUnknown, parseShortlistRow, recordAttempt, resolveCheck, startCheck } from '@/lib/scout-shortlist-recovery'

export type ScoutAthlete = { user_id: string; display_name: string; position: string | null; province: string | null; current_team: string | null; verification_level: string; power: number | null; player_path: string }
export type Shortlist = { athlete_id: string; note: string }

export default function ScoutClient({ athletes, initialShortlist }: { athletes: ScoutAthlete[]; initialShortlist: Shortlist[] }) {
  const [query, setQuery] = useState(''); const [position, setPosition] = useState(''); const [province, setProvince] = useState(''); const [minPower, setMinPower] = useState(''); const [shortlist, setShortlist] = useState(initialShortlist); const [note, setNote] = useState<Record<string, string>>({}); const [message, setMessage] = useState(''); const [busy, setBusy] = useState<string | null>(null)
  const inFlight = useRef(false)
  // Per-athlete recovery, not a page-wide lock. The rules and the reasons live in
  // lib/scout-shortlist-recovery.ts, where they can be tested without a DOM.
  const [recovery, setShortlistRecovery] = useState(EMPTY_SHORTLIST_RECOVERY)
  // Orders the read-backs. A ref, not state: the number has to be readable the instant
  // the request is sent, and nothing draws it.
  const attempts = useRef(EMPTY_ATTEMPT_LEDGER)
  // New props carry the authoritative shortlist, so adopt it as data. They unlock
  // nothing: a row is only released by its own read-back answering.
  useEffect(() => { setShortlist(initialShortlist) }, [initialShortlist])
  const provinces = useMemo(() => [...new Set(athletes.map(a => a.province).filter(Boolean) as string[])].sort(), [athletes])
  const shown = athletes.filter(a => (!query || a.display_name.toLowerCase().includes(query.toLowerCase())) && (!position || a.position === position) && (!province || a.province === province) && (!minPower || (a.power ?? 0) >= Number(minPower)))
  const saved = new Map(shortlist.map(item => [item.athlete_id, item]))
  const update = async (athleteId: string, remove = false) => {
    if (inFlight.current || !canWriteRow(recovery, athleteId)) return
    inFlight.current = true; setBusy(athleteId); setMessage('')
    try {
      const result = await requestJson('/api/scout-shortlist', { method: remove ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ athleteId, note: note[athleteId] ?? '' }) })
      if (!result.ok) {
        if (result.kind === 'network') {
          setShortlistRecovery(state => markOutcomeUnknown(state, athleteId))
          setMessage('การเชื่อมต่อหลุด ยังไม่ทราบว่า Shortlist รายนี้ถูกบันทึกหรือไม่ กดโหลดสถานะรายการนี้ใหม่ก่อนลองอีกครั้ง')
          return
        }
        if (result.status === 401) { setMessage('กรุณาเข้าสู่ระบบก่อนบันทึก Shortlist'); return }
        setMessage(requestErrorText(result, { fallback: 'ดำเนินการไม่สำเร็จ' }))
        return
      }
      setShortlist(items => remove ? items.filter(item => item.athlete_id !== athleteId) : [...items.filter(item => item.athlete_id !== athleteId), { athlete_id: athleteId, note: note[athleteId] ?? '' }])
    } finally { inFlight.current = false; setBusy(null) }
  }
  const checkRow = async (athleteId: string) => {
    // Claimed before the request goes out, so a reply can be checked against it. A
    // second press supersedes the first even if the first answers later.
    const claimed = recordAttempt(attempts.current, athleteId)
    attempts.current = claimed.ledger
    setShortlistRecovery(state => startCheck(state, athleteId))
    setMessage('')

    const result = await requestJson(`/api/scout-shortlist?athleteId=${encodeURIComponent(athleteId)}`)
    if (!isLatestAttempt(attempts.current, athleteId, claimed.attempt)) return

    // Nothing was learnt, so the row stays exactly as unknown as it was. Only the
    // "checking" label comes off, which is what lets the scout press again. A 2xx whose
    // body is not the row we asked about is in the same position: it answers nothing.
    const row = result.ok ? parseShortlistRow(result.data, athleteId) : null
    if (row === null) {
      setShortlistRecovery(state => failCheck(state, athleteId))
      setMessage(!result.ok && result.kind === 'network'
        ? 'อ่านสถานะไม่สำเร็จเพราะเชื่อมต่อไม่ได้ รายการนี้ยังล็อกอยู่ กดโหลดสถานะใหม่อีกครั้งได้'
        : result.ok
          ? 'เซิร์ฟเวอร์ตอบกลับมาในรูปแบบที่อ่านไม่ได้ รายการนี้ยังล็อกอยู่ กดโหลดสถานะใหม่อีกครั้งได้'
          : requestErrorText(result, { fallback: 'อ่านสถานะ Shortlist ไม่สำเร็จ' }))
      return
    }

    // The server has spoken for this row, so replace whatever this tab believed.
    setShortlist(items => {
      const without = items.filter(item => item.athlete_id !== athleteId)
      return row.saved ? [...without, { athlete_id: athleteId, note: row.note }] : without
    })
    if (row.saved) setNote(current => ({ ...current, [athleteId]: row.note }))
    setShortlistRecovery(state => resolveCheck(state, athleteId))
  }
  const field = { border: '1px solid #d4dae2', borderRadius: 8, minHeight: 39, padding: '0 9px', font: '700 12px var(--font-sarabun)', background: '#fff' }
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(260px,.34fr)', gap: 16 }}><section><div style={{ background: '#fff', border: '1px solid #e2e5e9', borderRadius: 13, padding: 12, marginBottom: 14 }}><div style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(3,1fr)', gap: 7 }}><label style={{ position: 'relative' }}><Search size={15} color="#7a8492" style={{ position: 'absolute', left: 10, top: 12 }} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาชื่อนักกีฬา" style={{ ...field, width: '100%', boxSizing: 'border-box', paddingLeft: 32 }} /></label><select value={province} onChange={e => setProvince(e.target.value)} style={field}><option value="">ทุกจังหวัด</option>{provinces.map(v => <option key={v}>{v}</option>)}</select><select value={position} onChange={e => setPosition(e.target.value)} style={field}><option value="">ทุกตำแหน่ง</option>{['FW','MF','DF','GK'].map(v => <option key={v}>{v}</option>)}</select><select value={minPower} onChange={e => setMinPower(e.target.value)} style={field}><option value="">Power ทั้งหมด</option><option value="1000">1,000+</option><option value="1300">1,300+</option><option value="1600">1,600+</option></select></div></div><p style={{ color: '#697586', fontSize: 12, margin: '0 0 10px' }}><SlidersHorizontal size={13} /> พบ {shown.length} โปรไฟล์ · แสดงเฉพาะนักกีฬาที่อนุญาตเผยแพร่</p><div style={{ display: 'grid', gap: 9 }}>{shown.map(a => { const isSaved = saved.has(a.user_id); return <article key={a.user_id} style={{ background: '#fff', border: `1px solid ${isSaved ? '#f0cc61' : '#e2e5e9'}`, borderLeft: `4px solid ${isSaved ? '#f5c518' : '#cc0001'}`, borderRadius: 10, padding: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><Link href={a.player_path} style={{ color: '#172033', textDecoration: 'none' }}><b style={{ fontSize: 16 }}>{a.display_name}</b><p style={{ margin: '4px 0', color: '#687586', fontSize: 12 }}><MapPin size={13} /> {a.province ?? 'ไม่ระบุ'} · {a.position ?? 'N/A'} · {a.current_team ?? 'ไม่ระบุทีม'}</p></Link><b style={{ font: '800 25px var(--font-oswald)', color: a.power ? '#cc0001' : '#98a2b3' }}>{a.power?.toLocaleString() ?? '—'}</b></div><div style={{ display: 'flex', gap: 7, marginTop: 9 }}><input value={note[a.user_id] ?? saved.get(a.user_id)?.note ?? ''} onChange={e => setNote({ ...note, [a.user_id]: e.target.value })} placeholder="โน้ตส่วนตัว (ไม่บังคับ)" style={{ ...field, flex: 1 }} />{canReloadRow(recovery, a.user_id) ? <button type="button" onClick={() => void checkRow(a.user_id)} style={{ border: 0, borderRadius: 8, background: '#101827', color: 'white', padding: '0 10px', fontWeight: 800, fontSize: 11 }}>{isChecking(recovery, a.user_id) ? 'กำลังตรวจ…' : 'โหลดสถานะใหม่'}</button> : <button disabled={busy === a.user_id} onClick={() => void update(a.user_id, isSaved)} style={{ border: 0, borderRadius: 8, background: isSaved ? '#f4f4f5' : '#101827', color: isSaved ? '#b42318' : '#f5c518', padding: '0 10px', fontWeight: 900 }}>{isSaved ? <X size={16} /> : <Bookmark size={16} />}</button>}</div></article> })}</div></section><aside style={{ background: '#101827', color: 'white', borderRadius: 13, padding: 15, height: 'fit-content', position: 'sticky', top: 70 }}><p style={{ margin: 0, color: '#f5c518', font: '800 10px var(--font-oswald)', letterSpacing: 1.5 }}>PRIVATE TALENT BOARD</p><h2 style={{ margin: '6px 0 4px', fontSize: 22 }}>Shortlist</h2><p style={{ color: 'rgba(255,255,255,.68)', fontSize: 12, lineHeight: 1.5 }}>เห็นเฉพาะบัญชีคุณ นักกีฬาจะไม่เห็นว่าอยู่ใน shortlist</p><b style={{ font: '800 35px var(--font-oswald)', color: '#f5c518' }}>{shortlist.length}</b><span style={{ color: 'rgba(255,255,255,.62)', fontSize: 12 }}> นักกีฬาที่ติดตาม</span>{message && <p role="status" style={{ borderRadius: 8, background: '#7f1d1d', padding: 9, fontSize: 12 }}>{message}</p>}<p style={{ borderTop: '1px solid rgba(255,255,255,.13)', paddingTop: 12, color: 'rgba(255,255,255,.6)', fontSize: 11, lineHeight: 1.5 }}>Power Rating คือผลงานที่ยืนยันจากการแข่งขัน ไม่ใช่ค่าที่นักกีฬากรอกเอง</p></aside></div>
}
