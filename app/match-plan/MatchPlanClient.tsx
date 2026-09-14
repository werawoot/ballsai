'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { CheckCircle2, LoaderCircle, Save, ShieldCheck, UsersRound } from 'lucide-react'

type Tournament = { name: string; start_date: string | null }
type TournamentRelation = Tournament[] | null
export type MatchPlanTeam = { id: string; name: string; status: string; tournament_id: string; tournaments: TournamentRelation }
type LineupRole = 'starter' | 'substitute'
type Position = 'GK' | 'DF' | 'MF' | 'FW'
type RosterMember = { athlete_id: string; display_name: string; profile_position: string | null; lineup_role: LineupRole | null; position: Position | null; slot_order: number | null }
type Plan = { id: string; formation: string; match_focus: string; team_talk: string; updated_at: string }
type PlanPayload = { plan: Plan | null; roster: RosterMember[] }

const formations = ['1-2-1', '2-2-1', '2-3-1', '3-2-1', '4-3-3']
const positions: Position[] = ['GK', 'DF', 'MF', 'FW']
const input: CSSProperties = { width: '100%', border: '1px solid #d9dde4', borderRadius: 10, padding: '11px 12px', color: '#162235', fontFamily: 'var(--font-sarabun)', fontSize: 14, background: '#fff', outline: 'none' }

export default function MatchPlanClient({ teams }: { teams: MatchPlanTeam[] }) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '')
  const [payload, setPayload] = useState<PlanPayload | null>(null)
  const [loading, setLoading] = useState(Boolean(teams[0]?.id))
  const [saving, setSaving] = useState(false)
  const [formation, setFormation] = useState('2-2-1')
  const [matchFocus, setMatchFocus] = useState('')
  const [teamTalk, setTeamTalk] = useState('')
  const [roles, setRoles] = useState<Record<string, LineupRole | undefined>>({})
  const [lineupPositions, setLineupPositions] = useState<Record<string, Position>>({})
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!teamId) return
    let active = true
    fetch(`/api/match-plans?teamId=${encodeURIComponent(teamId)}`)
      .then(async response => ({ ok: response.ok, body: await response.json().catch(() => null) }))
      .then(result => {
        if (!active) return
        if (!result.ok || !result.body?.data) { setPayload(null); setMessage(result.body?.error ?? 'โหลดแผนไม่สำเร็จ'); return }
        const data = result.body.data as PlanPayload
        setPayload(data)
        setFormation(data.plan?.formation ?? '2-2-1')
        setMatchFocus(data.plan?.match_focus ?? '')
        setTeamTalk(data.plan?.team_talk ?? '')
        setRoles(Object.fromEntries(data.roster.filter(member => member.lineup_role).map(member => [member.athlete_id, member.lineup_role as LineupRole])))
        setLineupPositions(Object.fromEntries(data.roster.filter(member => member.lineup_role && member.position).map(member => [member.athlete_id, member.position as Position])))
      })
      .catch(() => active && setMessage('เชื่อมต่อเพื่อโหลดแผนไม่สำเร็จ'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [teamId])

  const roster = useMemo(() => payload?.roster ?? [], [payload])
  const starters = useMemo(() => roster.filter(member => roles[member.athlete_id] === 'starter'), [roster, roles])
  const substitutes = useMemo(() => roster.filter(member => roles[member.athlete_id] === 'substitute'), [roster, roles])
  const selectedTeam = teams.find(team => team.id === teamId)

  const chooseRole = (athleteId: string, role: LineupRole) => {
    setRoles(current => ({ ...current, [athleteId]: current[athleteId] === role ? undefined : role }))
    setLineupPositions(current => current[athleteId] ? current : { ...current, [athleteId]: 'MF' })
    setMessage('')
  }

  const save = async () => {
    if (!teamId) return
    setSaving(true); setMessage('')
    const ordered = [...starters, ...substitutes]
    const response = await fetch('/api/match-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      teamId, formation, matchFocus, teamTalk,
      players: ordered.map((member, index) => ({ athlete_id: member.athlete_id, lineup_role: roles[member.athlete_id], position: lineupPositions[member.athlete_id] ?? 'MF', slot_order: index })),
    }) })
    const result = await response.json().catch(() => null) as { error?: string } | null
    setSaving(false)
    if (!response.ok) { setMessage(result?.error ?? 'บันทึกแผนไม่สำเร็จ'); return }
    setMessage('บันทึก Match Plan แล้ว — ยังไม่กระทบผลแข่งหรือ Rating')
  }

  if (teams.length === 0) return <div style={{ background: '#fff', border: '1px solid #e0e4ea', borderRadius: 14, padding: 24, color: '#627084', lineHeight: 1.6 }}>ยังไม่มีทีมที่คุณจัดการได้ สร้างทีมและเชิญนักกีฬาให้ตอบรับก่อน แล้วจึงกลับมาวางแผนก่อนแข่ง</div>

  return <div style={{ display: 'grid', gap: 15 }}>
    <section style={{ background: '#fff', border: '1px solid #e0e4ea', borderRadius: 14, padding: 16, boxShadow: '0 4px 18px rgba(16,24,39,.04)' }}>
      <label style={{ display: 'block', color: '#687386', font: '800 11px var(--font-oswald)', letterSpacing: .8, marginBottom: 6 }}>TEAM / TOURNAMENT</label>
      <select value={teamId} onChange={event => { setLoading(true); setMessage(''); setTeamId(event.target.value) }} style={input}>
        {teams.map(team => <option key={team.id} value={team.id}>{team.name} · {team.tournaments?.[0]?.name ?? 'รายการแข่งขัน'}</option>)}
      </select>
      {selectedTeam && <p style={{ margin: '9px 0 0', color: '#758092', fontSize: 12 }}>สถานะทีม: {selectedTeam.status} · ใช้แผนนี้เป็นการเตรียมตัว ไม่ใช่ใบส่งรายชื่อทางการ</p>}
    </section>

    {loading ? <div style={{ textAlign: 'center', padding: 38, color: '#667386' }}><LoaderCircle size={22} style={{ animation: 'spin 1s linear infinite' }} /> กำลังโหลด roster…</div> : <>
      <section style={{ background: '#101827', borderRadius: 14, padding: 17, color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}><div><p style={{ margin: 0, color: '#f5c518', font: '800 10px var(--font-oswald)', letterSpacing: 1 }}>LINEUP BOARD</p><h2 style={{ margin: '4px 0 0', font: '800 26px var(--font-oswald)' }}>{starters.length} <span style={{ color: 'rgba(255,255,255,.58)', fontSize: 14 }}>ตัวจริง</span> · {substitutes.length} <span style={{ color: 'rgba(255,255,255,.58)', fontSize: 14 }}>สำรอง</span></h2></div><UsersRound color="#f5c518" size={28} /></div>
        <p style={{ color: 'rgba(255,255,255,.68)', fontSize: 12, margin: '11px 0 0', lineHeight: 1.5 }}>สมาชิกที่ยังไม่กดรับคำเชิญจะไม่ปรากฏ และไม่สามารถใส่ในแผนได้</p>
      </section>

      <section style={{ background: '#fff', border: '1px solid #e0e4ea', borderRadius: 14, padding: 16 }}>
        <label style={{ display: 'block', color: '#687386', font: '800 11px var(--font-oswald)', letterSpacing: .8, marginBottom: 8 }}>FORMATION</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{formations.map(item => <button type="button" key={item} onClick={() => setFormation(item)} style={{ padding: '8px 11px', borderRadius: 9, cursor: 'pointer', fontWeight: 800, border: formation === item ? '1px solid #CC0001' : '1px solid #d9dde4', color: formation === item ? '#fff' : '#3e4b5d', background: formation === item ? '#CC0001' : '#fff' }}>{item}</button>)}</div>
      </section>

      <section style={{ background: '#fff', border: '1px solid #e0e4ea', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '15px 16px', borderBottom: '1px solid #e9edf1' }}><h2 style={{ margin: 0, font: '800 21px var(--font-oswald)', color: '#162235' }}>ROSTER ที่ตอบรับแล้ว</h2><p style={{ margin: '3px 0 0', color: '#7c8796', fontSize: 12 }}>กด “ตัวจริง” หรือ “สำรอง” อีกครั้งเพื่อนำออกจากแผน</p></div>
        {roster.length === 0 ? <p style={{ padding: 18, color: '#99701b', fontSize: 13, lineHeight: 1.6 }}>ทีมนี้ยังไม่มีสมาชิกที่ตอบรับคำเชิญ จึงยังวางรายชื่อไม่ได้</p> : <div>{roster.map(member => { const role = roles[member.athlete_id]; return <div key={member.athlete_id} style={{ padding: '13px 16px', borderBottom: '1px solid #eef0f3', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, alignItems: 'center' }}><div style={{ minWidth: 0 }}><b style={{ color: '#1b2738', fontSize: 14 }}>{member.display_name}</b><div style={{ color: '#7a8796', fontSize: 11, marginTop: 2 }}>{member.profile_position || 'ไม่ระบุตำแหน่งใน Profile'}{role && ` · ${lineupPositions[member.athlete_id] ?? 'MF'}`}</div></div><div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}><button type="button" onClick={() => chooseRole(member.athlete_id, 'starter')} style={{ border: role === 'starter' ? '1px solid #CC0001' : '1px solid #d9dde4', background: role === 'starter' ? '#CC0001' : '#fff', color: role === 'starter' ? '#fff' : '#455366', padding: '6px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 800 }}>ตัวจริง</button><button type="button" onClick={() => chooseRole(member.athlete_id, 'substitute')} style={{ border: role === 'substitute' ? '1px solid #b7791f' : '1px solid #d9dde4', background: role === 'substitute' ? '#fff6db' : '#fff', color: role === 'substitute' ? '#8a5a12' : '#455366', padding: '6px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 800 }}>สำรอง</button>{role && <select aria-label={`ตำแหน่ง ${member.display_name}`} value={lineupPositions[member.athlete_id] ?? 'MF'} onChange={event => setLineupPositions(current => ({ ...current, [member.athlete_id]: event.target.value as Position }))} style={{ border: '1px solid #d9dde4', borderRadius: 8, padding: '5px 4px', color: '#263449', fontSize: 11, fontWeight: 800, background: '#fff' }}>{positions.map(position => <option key={position}>{position}</option>)}</select>}</div></div> })}</div>}
      </section>

      <section style={{ background: '#fff', border: '1px solid #e0e4ea', borderRadius: 14, padding: 16, display: 'grid', gap: 12 }}>
        <div><label style={{ display: 'block', color: '#687386', font: '800 11px var(--font-oswald)', letterSpacing: .8, marginBottom: 6 }}>MATCH FOCUS</label><textarea value={matchFocus} onChange={event => setMatchFocus(event.target.value)} maxLength={1000} rows={3} placeholder="เช่น บีบพื้นที่แดนกลาง, เริ่มเกมให้รัดกุม" style={{ ...input, resize: 'vertical' }} /></div>
        <div><label style={{ display: 'block', color: '#687386', font: '800 11px var(--font-oswald)', letterSpacing: .8, marginBottom: 6 }}>TEAM TALK</label><textarea value={teamTalk} onChange={event => setTeamTalk(event.target.value)} maxLength={1000} rows={3} placeholder="ข้อความสั้น ๆ ถึงทีมก่อนลงสนาม" style={{ ...input, resize: 'vertical' }} /></div>
      </section>

      {message && <div style={{ borderRadius: 11, padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 8, background: message.startsWith('บันทึก') ? '#e7f7ec' : '#fff0f0', color: message.startsWith('บันทึก') ? '#17683a' : '#a22b2d', fontSize: 13, fontWeight: 700 }}>{message.startsWith('บันทึก') ? <CheckCircle2 size={17} /> : <ShieldCheck size={17} />}{message}</div>}
      <button type="button" disabled={saving} onClick={save} style={{ width: '100%', background: saving ? '#9ea6b1' : '#CC0001', color: 'white', border: 'none', borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 800, cursor: saving ? 'wait' : 'pointer', display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}><Save size={17} /> {saving ? 'กำลังบันทึก…' : 'บันทึก Match Plan'}</button>
    </>}
  </div>
}
