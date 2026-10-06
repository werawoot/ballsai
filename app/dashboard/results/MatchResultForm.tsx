'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Eye, Save } from 'lucide-react'
import { apiErrorText } from '@/lib/api-error-text'
import {
  addAssist, addGoal, addUnattributed, emptyEntry, entryOf, performances, previewBlocker,
  teamScore, toggleCleanSheet, toggleMvp, togglePlayed, type EntryState, type Side,
} from '@/lib/match-entry'
import './results.css'

type TournamentOption = { id: string; name: string; organizer_id: string }
type TeamOption = { id: string; name: string; tournament_id: string; status: string }
type PlayerOption = {
  id: string
  player_id: string | null
  player_name: string
  position: string
  pts: number
  teamId: string
  isNew?: boolean
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
type Step = 'entry' | 'preview' | 'done'

// Few enough players that a search box would only be in the way.
const SEARCH_FROM = 12

// Recording a match is a handful of taps (docs/ux-audit, mockup v2-3): choose the two
// teams, tap who played and who scored, preview, confirm. The score is the sum of the
// goals, so it cannot disagree with the scorers. The API, the rating and the one-record
// guarantee (requestId, sql/60) are unchanged.
export default function MatchResultForm({ tournaments, teams, players }: {
  tournaments: TournamentOption[]
  teams: TeamOption[]
  players: PlayerOption[]
}) {
  const t = useTranslations('matchEntry')
  const tApi = useTranslations('apiErrors')
  const router = useRouter()
  const tournamentId = tournaments[0]?.id ?? ''
  const tournamentTeams = useMemo(() => teams.filter(team => team.tournament_id === tournamentId), [teams, tournamentId])
  // With exactly two teams there is nothing to choose.
  const initial = () => tournamentTeams.length === 2 ? emptyEntry(tournamentTeams[0].id, tournamentTeams[1].id) : emptyEntry()

  const [entry, setEntry] = useState<EntryState>(initial)
  const [step, setStep] = useState<Step>('entry')
  const [tab, setTab] = useState<Side>('A')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState('')
  const [preview, setPreview] = useState<PreviewItem[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // One id per preview: every confirm of that preview, retried or double-tapped, is the
  // same submission and records the match once (sql/60). A new preview gets a new id.
  const [requestId, setRequestId] = useState('')

  const teamName = (id: string) => tournamentTeams.find(team => team.id === id)?.name ?? ''
  const blocker = previewBlocker(entry, players)
  const scoreA = teamScore(entry, players, 'A')
  const scoreB = teamScore(entry, players, 'B')
  const bothChosen = Boolean(entry.teamAId && entry.teamBId)

  const change = (next: EntryState) => { setEntry(next); setError('') }
  const chooseTeam = (id: string) => {
    if (!entry.teamAId) change({ ...entry, teamAId: id })
    else if (id === entry.teamAId) change({ ...entry, teamAId: '' })
    else change({ ...entry, teamBId: id })
  }

  const send = async (mode: 'preview' | 'confirm') => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/match-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          requestId: mode === 'confirm' ? requestId : undefined,
          tournamentId,
          teamAId: entry.teamAId,
          teamBId: entry.teamBId,
          teamAScore: scoreA,
          teamBScore: scoreB,
          performances: performances(entry, players),
        }),
      })
      const result = await response.json().catch(() => null) as { error?: string; code?: string; preview?: PreviewItem[] } | null
      if (!response.ok) {
        setError(apiErrorText(result, code => (tApi.has(code as never) ? tApi(code as never) : null), t('failed')))
        return
      }
      if (mode === 'preview') {
        setPreview(result?.preview ?? [])
        setRequestId(crypto.randomUUID())
        setStep('preview')
      } else {
        setStep('done')
        router.refresh()
      }
    } catch {
      setError(t('network'))
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setEntry(initial())
    setStep('entry'); setTab('A'); setQuery(''); setOpenId(''); setPreview([]); setRequestId(''); setError('')
  }

  const sideTeamId = tab === 'A' ? entry.teamAId : entry.teamBId
  const roster = players.filter(player => player.teamId === sideTeamId)
  const needle = query.trim().toLowerCase()
  const shown = needle ? roster.filter(player => `${player.player_name} ${player.position}`.toLowerCase().includes(needle)) : roster
  const blockText = blocker === 'teams' ? t('blockTeams') : blocker === 'sameTeam' ? t('blockSameTeam') : blocker === 'noPlayers' ? t('blockNoPlayers') : ''

  const stepper = (label: string, aria: string, value: number, onLess: () => void, onMore: () => void) => (
    <div className="mr-stepper">
      <span>{label}</span>
      <button type="button" className="mr-chip" aria-label={`${aria}: ${t('less')}`} onClick={onLess}>−</button>
      <b>{value}</b>
      <button type="button" className="mr-chip" aria-label={`${aria}: ${t('moreCount')}`} onClick={onMore}>+</button>
    </div>
  )

  if (step === 'done') {
    return <div className="mr-body">
      <p className="mr-done" role="status">{t('done')} · {teamName(entry.teamAId)} {scoreA} – {scoreB} {teamName(entry.teamBId)}</p>
      <div className="mr-dock"><div className="mr-dock-in"><button type="button" className="ui-btn ui-btn-primary" onClick={reset}>{t('next')}</button></div></div>
    </div>
  }

  if (step === 'preview') {
    return <div className="mr-body">
      <p className="mr-eyebrow">{t('previewEyebrow')}</p>
      <h2 className="mr-title">{teamName(entry.teamAId)} {scoreA} – {scoreB} {teamName(entry.teamBId)}</h2>
      <p className="mr-sub">{t('previewSub')}</p>
      <div style={{ marginTop: 14 }}>
        {preview.map(item => <div className="mr-result" key={item.playerRankId}>
          <div>
            <strong>{item.playerName}</strong>
            <small>{t('ratingLine', { match: `${item.matchChange >= 0 ? '+' : ''}${item.matchChange}`, bonus: item.performanceBonus })}</small>
          </div>
          <div className={`mr-delta ${item.ratingChange >= 0 ? 'is-up' : 'is-down'}`}>
            {item.ratingChange >= 0 ? '+' : ''}{item.ratingChange}
            <small>{item.ratingBefore} → {item.ratingAfter}</small>
          </div>
        </div>)}
      </div>
      {error && <p className="mr-error" role="alert">{error}</p>}
      <div className="mr-dock"><div className="mr-dock-in">
        <p className="mr-dock-note">{t('once')}</p>
        <button type="button" className="ui-btn ui-btn-primary" disabled={loading || !requestId} onClick={() => send('confirm')}><Save size={18} aria-hidden="true" /> {loading ? t('confirming') : t('confirm')}</button>
        <button type="button" className="mr-ghost" disabled={loading} onClick={() => { setStep('entry'); setPreview([]); setRequestId(''); setError('') }}>{t('back')}</button>
      </div></div>
    </div>
  }

  // Step 1a: which two teams.
  if (!bothChosen || entry.teamAId === entry.teamBId) {
    return <div className="mr-body">
      <p className="mr-eyebrow">{t('eyebrow')}</p>
      <h2 className="mr-title">{t('teamsTitle')}</h2>
      <p className="mr-sub">{t('teamsHint')}</p>
      {tournamentTeams.length === 0
        ? <p className="mr-empty">{t('noTeams')}</p>
        : <ul className="mr-teams">{tournamentTeams.map(team => {
          const role = team.id === entry.teamAId ? t('home') : team.id === entry.teamBId ? t('away') : ''
          return <li key={team.id}><button type="button" className="mr-team" aria-pressed={Boolean(role)} onClick={() => chooseTeam(team.id)}>
            <span>{team.name}</span>{role && <span className="ui-chip is-red">{role}</span>}
          </button></li>
        })}</ul>}
    </div>
  }

  // Step 1b: score and who played.
  return <div className="mr-body">
    <p className="mr-eyebrow">{t('eyebrow')}</p>
    <div className="mr-board" aria-live="polite">
      <div><div className="mr-score">{scoreA}</div><div className="mr-board-name">{teamName(entry.teamAId)}</div></div>
      <span className="mr-board-dash" aria-hidden="true">–</span>
      <div><div className="mr-score">{scoreB}</div><div className="mr-board-name">{teamName(entry.teamBId)}</div></div>
    </div>
    <button type="button" className="mr-link" onClick={() => change(emptyEntry())}>{t('changeTeams')}</button>
    <p className="mr-sub" style={{ textAlign: 'center', fontSize: 13 }}>{t('scoreHint')}</p>

    <div className="mr-tabs" role="group">
      {(['A', 'B'] as const).map(side => <button key={side} type="button" className="mr-tab" aria-pressed={tab === side} onClick={() => { setTab(side); setQuery(''); setOpenId('') }}>
        {teamName(side === 'A' ? entry.teamAId : entry.teamBId)}
      </button>)}
    </div>

    {roster.length > SEARCH_FROM && <input className="mr-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('searchPlaceholder')} aria-label={t('searchPlaceholder')} />}
    {roster.length === 0 && <p className="mr-empty">{t('noPlayers')}</p>}

    {shown.map(player => {
      const state = entryOf(entry, player.id)
      return <div className="mr-player" key={player.id}>
        <div className="mr-line">
          <button type="button" className="mr-name" aria-pressed={state.played} aria-label={t('played', { name: player.player_name })} onClick={() => change(togglePlayed(entry, player.id))}>
            <span>{player.player_name}</span>
            <small>{[player.position, player.isNew ? t('newPlayer') : ''].filter(Boolean).join(' · ')}</small>
          </button>
          <button type="button" className="mr-chip" aria-pressed={state.goals > 0} aria-label={t('goal', { name: player.player_name })} onClick={() => change(addGoal(entry, player.id, 1))}>⚽{state.goals > 0 && ` ${state.goals}`}</button>
          <button type="button" className="mr-chip is-mvp" aria-pressed={state.mvp} aria-label={t('mvp', { name: player.player_name })} onClick={() => change(toggleMvp(entry, player.id))}>★</button>
          <button type="button" className="mr-chip is-quiet" aria-expanded={openId === player.id} aria-label={t('more', { name: player.player_name })} onClick={() => setOpenId(openId === player.id ? '' : player.id)}>⋯</button>
        </div>
        {openId === player.id && <div className="mr-details">
          {stepper('⚽', t('goalWord'), state.goals, () => change(addGoal(entry, player.id, -1)), () => change(addGoal(entry, player.id, 1)))}
          {stepper(t('assists'), t('assists'), state.assists, () => change(addAssist(entry, player.id, -1)), () => change(addAssist(entry, player.id, 1)))}
          <button type="button" className="mr-chip" aria-pressed={state.cleanSheet} onClick={() => change(toggleCleanSheet(entry, player.id))}>{t('cleanSheet')}</button>
        </div>}
      </div>
    })}

    <div className="mr-free">
      <span>{t('unattributed')}</span>
      {stepper('', t('unattributed'), entry.unattributed[tab], () => change(addUnattributed(entry, tab, -1)), () => change(addUnattributed(entry, tab, 1)))}
    </div>

    {error && <p className="mr-error" role="alert">{error}</p>}
    <div className="mr-dock"><div className="mr-dock-in">
      {blockText && <p className="mr-dock-note">{blockText}</p>}
      <button type="button" className="ui-btn ui-btn-primary" disabled={loading || Boolean(blocker)} onClick={() => send('preview')}><Eye size={18} aria-hidden="true" /> {loading ? t('previewing') : t('preview')}</button>
    </div></div>
  </div>
}
