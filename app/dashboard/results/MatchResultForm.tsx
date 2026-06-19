'use client'

import { useMemo, useState } from 'react'
import { CheckCircle, Eye, Plus, Save, Trash2 } from 'lucide-react'

type TournamentOption = {
  id: string
  name: string
  organizer_id: string
}

type TeamOption = {
  id: string
  name: string
  tournament_id: string
  status: string
}

type PlayerOption = {
  id: string
  player_name: string
  team: string
  position: string
  pts: number
}

type PerformanceRow = {
  id: string
  teamId: string
  playerRankId: string
  goals: number
  assists: number
  cleanSheet: boolean
  mvp: boolean
}

type PreviewItem = {
  playerRankId: string
  playerName: string
  teamId: string
  ratingBefore: number
  ratingAfter: number
  ratingChange: number
  matchChange: number
  performanceBonus: number
  confidence: string
}

function makeRow(teamId = ''): PerformanceRow {
  return {
    id: crypto.randomUUID(),
    teamId,
    playerRankId: '',
    goals: 0,
    assists: 0,
    cleanSheet: false,
    mvp: false,
  }
}

export default function MatchResultForm({
  tournaments,
  teams,
  players,
}: {
  tournaments: TournamentOption[]
  teams: TeamOption[]
  players: PlayerOption[]
}) {
  const [tournamentId, setTournamentId] = useState(tournaments[0]?.id ?? '')
  const tournamentTeams = useMemo(
    () => teams.filter(team => team.tournament_id === tournamentId),
    [teams, tournamentId]
  )
  const [teamAId, setTeamAId] = useState('')
  const [teamBId, setTeamBId] = useState('')
  const [teamAScore, setTeamAScore] = useState(0)
  const [teamBScore, setTeamBScore] = useState(0)
  const [rows, setRows] = useState<PerformanceRow[]>([makeRow()])
  const [preview, setPreview] = useState<PreviewItem[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const inputStyle = {
    width: '100%',
    border: '1.5px solid #e5e5e5',
    borderRadius: 10,
    padding: '10px 12px',
    fontSize: 14,
    outline: 'none',
    fontFamily: 'var(--font-sarabun)',
    color: '#111',
    background: '#fafafa',
  }

  const selectedTeamIds = [teamAId, teamBId].filter(Boolean)
  const previewByPlayer = new Map(preview.map(item => [item.playerRankId, item]))

  const updateRow = (id: string, patch: Partial<PerformanceRow>) => {
    setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row))
    setPreview([])
    setConfirmed(false)
  }

  const submit = async (mode: 'preview' | 'confirm') => {
    setLoading(true)
    setMessage('')
    setConfirmed(false)

    const response = await fetch('/api/match-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        tournamentId,
        teamAId,
        teamBId,
        teamAScore,
        teamBScore,
        performances: rows
          .filter(row => row.teamId && row.playerRankId)
          .map(row => ({
            playerRankId: row.playerRankId,
            teamId: row.teamId,
            goals: row.goals,
            assists: row.assists,
            cleanSheet: row.cleanSheet,
            mvp: row.mvp,
          })),
      }),
    })

    const result = await response.json().catch(() => null) as
      | { error?: string; preview?: PreviewItem[]; matchResultId?: string }
      | null

    if (!response.ok) {
      setMessage(result?.error ?? 'บันทึกผลไม่สำเร็จ')
    } else {
      setPreview(result?.preview ?? [])
      if (mode === 'confirm') {
        setConfirmed(true)
        setMessage(`บันทึกผลเรียบร้อย ${result?.matchResultId ? `#${result.matchResultId.slice(0, 8)}` : ''}`)
      }
    }

    setLoading(false)
  }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e5e5e5', padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase', marginBottom: 14 }}>
          Match Result
        </div>

        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#aaa', marginBottom: 5, textTransform: 'uppercase' }}>รายการแข่งขัน</label>
        <select value={tournamentId} onChange={event => {
          setTournamentId(event.target.value)
          setTeamAId('')
          setTeamBId('')
          setRows([makeRow()])
          setPreview([])
        }} style={{ ...inputStyle, marginBottom: 12 }}>
          <option value="">เลือกรายการแข่ง</option>
          {tournaments.map(tournament => (
            <option key={tournament.id} value={tournament.id}>{tournament.name}</option>
          ))}
        </select>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px', gap: 10, marginBottom: 10 }}>
          <select value={teamAId} onChange={event => {
            setTeamAId(event.target.value)
            setPreview([])
          }} style={inputStyle}>
            <option value="">Team A</option>
            {tournamentTeams.map(team => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
          <input type="number" min={0} value={teamAScore} onChange={event => {
            setTeamAScore(parseInt(event.target.value) || 0)
            setPreview([])
          }} style={{ ...inputStyle, textAlign: 'center', fontFamily: 'var(--font-oswald)', fontSize: 18, fontWeight: 700 }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px', gap: 10 }}>
          <select value={teamBId} onChange={event => {
            setTeamBId(event.target.value)
            setPreview([])
          }} style={inputStyle}>
            <option value="">Team B</option>
            {tournamentTeams.map(team => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
          <input type="number" min={0} value={teamBScore} onChange={event => {
            setTeamBScore(parseInt(event.target.value) || 0)
            setPreview([])
          }} style={{ ...inputStyle, textAlign: 'center', fontFamily: 'var(--font-oswald)', fontSize: 18, fontWeight: 700 }} />
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e5e5e5', padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase' }}>
            Player Performance
          </div>
          <button onClick={() => setRows(current => [...current, makeRow(teamAId)])} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#CC0001', color: 'white', border: 'none', borderRadius: 20, padding: '6px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
            <Plus size={14} /> เพิ่ม
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((row, index) => {
            const itemPreview = previewByPlayer.get(row.playerRankId)
            return (
              <div key={row.id} style={{ border: '1.5px solid #eee', borderRadius: 12, padding: 12, background: '#fafafa' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#555' }}>Player #{index + 1}</span>
                  {rows.length > 1 && (
                    <button onClick={() => {
                      setRows(current => current.filter(item => item.id !== row.id))
                      setPreview([])
                    }} style={{ background: 'white', color: '#CC0001', border: '1.5px solid #f2d0d0', borderRadius: 8, padding: 6, cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <select value={row.teamId} onChange={event => updateRow(row.id, { teamId: event.target.value })} style={inputStyle}>
                    <option value="">ทีม</option>
                    {selectedTeamIds.map(teamId => {
                      const team = teams.find(item => item.id === teamId)
                      return team ? <option key={team.id} value={team.id}>{team.name}</option> : null
                    })}
                  </select>
                  <select value={row.playerRankId} onChange={event => updateRow(row.id, { playerRankId: event.target.value })} style={inputStyle}>
                    <option value="">นักกีฬา</option>
                    {players.map(player => (
                      <option key={player.id} value={player.id}>{player.player_name} · {player.position} · {player.pts}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input type="number" min={0} value={row.goals} onChange={event => updateRow(row.id, { goals: parseInt(event.target.value) || 0 })} placeholder="Goals" style={inputStyle} />
                  <input type="number" min={0} value={row.assists} onChange={event => updateRow(row.id, { assists: parseInt(event.target.value) || 0 })} placeholder="Assists" style={inputStyle} />
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#555' }}>
                    <input type="checkbox" checked={row.cleanSheet} onChange={event => updateRow(row.id, { cleanSheet: event.target.checked })} />
                    Clean Sheet
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#555' }}>
                    <input type="checkbox" checked={row.mvp} onChange={event => updateRow(row.id, { mvp: event.target.checked })} />
                    MVP
                  </label>
                </div>

                {itemPreview && (
                  <div style={{ marginTop: 10, background: 'white', borderRadius: 10, padding: '10px 12px', border: '1.5px solid #e5e5e5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#111' }}>{itemPreview.playerName}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{itemPreview.ratingBefore} → {itemPreview.ratingAfter}</div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 18, fontWeight: 800, color: itemPreview.ratingChange >= 0 ? '#16a34a' : '#CC0001' }}>
                      {itemPreview.ratingChange >= 0 ? '+' : ''}{itemPreview.ratingChange}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {preview.length > 0 && (
        <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e5e5e5', padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase', marginBottom: 12 }}>
            Preview Rating Change
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {preview.map(item => (
              <div key={item.playerRankId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#111' }}>{item.playerName}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>Match {item.matchChange >= 0 ? '+' : ''}{item.matchChange} · Perf +{item.performanceBonus} · {item.confidence}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 18, fontWeight: 800, color: item.ratingChange >= 0 ? '#16a34a' : '#CC0001' }}>
                    {item.ratingChange >= 0 ? '+' : ''}{item.ratingChange}
                  </div>
                  <div style={{ fontSize: 11, color: '#888' }}>{item.ratingBefore} → {item.ratingAfter}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {message && (
        <div style={{ background: confirmed ? '#dcfce7' : '#fee2e2', color: confirmed ? '#166534' : '#991b1b', borderRadius: 12, padding: '12px 14px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          {confirmed && <CheckCircle size={16} />}
          {message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button onClick={() => submit('preview')} disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'white', color: '#CC0001', border: '1.5px solid #CC0001', borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 800, cursor: loading ? 'default' : 'pointer' }}>
          <Eye size={16} /> Preview
        </button>
        <button onClick={() => submit('confirm')} disabled={loading || preview.length === 0} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: loading || preview.length === 0 ? '#eee' : '#CC0001', color: loading || preview.length === 0 ? '#aaa' : 'white', border: 'none', borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 800, cursor: loading || preview.length === 0 ? 'default' : 'pointer' }}>
          <Save size={16} /> Confirm Result
        </button>
      </div>
    </div>
  )
}
