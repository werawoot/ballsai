'use client'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, LoaderCircle, Plus, Save, ShieldAlert, X } from 'lucide-react'
import { BOARD_FORMATIONS, DEFAULT_FORMATION, DRAFT_NAME_MAX, DRAFT_PLAYERS_MAX, benchPlayer, draftKey, readDraft, writeDraft, boardFromRoster, boardToPlayers, changeFormation, formationSlots, placePlayer, removePlayer, type BoardPosition, type BoardState } from '@/lib/match-plan-board'
import './match-plan.css'

// The coach's pitch board (lib/match-plan-board). Pick a team, pick a shape, tap a circle on
// the pitch and pick who plays there; everyone else can go on the bench. Only members who
// accepted the team invite can be saved (get_match_plan_safely). Before that -- no team yet,
// or nobody has accepted -- the coach plans a draft with names typed in, kept only in this
// browser (lib/match-plan-board readDraft). A plan is preparation, never a result: it
// changes no rating, XP or badge.

type Tournament = { name: string; start_date: string | null }
type TournamentRelation = Tournament[] | null
export type MatchPlanTeam = { id: string; name: string; status: string; tournament_id: string; tournaments: TournamentRelation }
type RosterMember = { athlete_id: string; display_name: string; profile_position: string | null; lineup_role: 'starter' | 'substitute' | null; position: BoardPosition | null; slot_order: number | null }
type Plan = { id: string; formation: string; match_focus: string; team_talk: string; updated_at: string }
type PlanPayload = { plan: Plan | null; roster: RosterMember[] }

const emptyBoard = (formation = DEFAULT_FORMATION): BoardState => ({ formation, slots: Array(formationSlots(formation).length).fill(null), bench: [] })
// A short name for a circle on the pitch: skip a title such as "ด.ช." and keep one word.
const shortName = (name: string) => name.trim().split(/\s+/).find(part => !part.endsWith('.')) ?? name
const storage = {
  read: (key: string) => { try { return window.localStorage.getItem(key) } catch { return null } },
  write: (key: string, value: string) => { try { window.localStorage.setItem(key, value); return true } catch { return false } },
}

export default function MatchPlanClient({ teams }: { teams: MatchPlanTeam[] }) {
  const t = useTranslations('matchPlan')
  const tl = useTranslations('labels')
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '')
  const [payload, setPayload] = useState<PlanPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [draftPlayers, setDraftPlayers] = useState<RosterMember[]>([])
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [board, setBoard] = useState<BoardState>(emptyBoard())
  const [matchFocus, setMatchFocus] = useState('')
  const [teamTalk, setTeamTalk] = useState('')
  const [picking, setPicking] = useState<number | null>(null)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let active = true
    // No team yet: nothing to fetch, the draft board is the whole page.
    const load = teamId
      ? fetch(`/api/match-plans?teamId=${encodeURIComponent(teamId)}`).then(async response => ({ ok: response.ok, body: await response.json().catch(() => null) }))
      : Promise.resolve({ ok: true, body: { data: { plan: null, roster: [] } } })
    load
      .then(result => {
        if (!active) return
        if (!result.ok || !result.body?.data) { setPayload(null); setMessage({ tone: 'error', text: result.body?.error ?? t('loadFailed') }); return }
        const data = result.body.data as PlanPayload
        setPayload(data)
        setDirty(false)
        if (data.roster.length === 0) {
          // Nobody to place yet: pick up this device's draft, if there is one.
          const draft = readDraft(storage.read(draftKey(teamId)))
          setDraftPlayers((draft?.players ?? []).map(player => ({ athlete_id: player.id, display_name: player.name, profile_position: null, lineup_role: null, position: null, slot_order: null })))
          setBoard(draft?.board ?? emptyBoard())
          setMatchFocus(draft?.focus ?? data.plan?.match_focus ?? '')
          setTeamTalk(draft?.talk ?? data.plan?.team_talk ?? '')
          return
        }
        const formation = data.plan?.formation && (BOARD_FORMATIONS as readonly string[]).includes(data.plan.formation) ? data.plan.formation : DEFAULT_FORMATION
        setBoard(boardFromRoster(data.roster, formation))
        setMatchFocus(data.plan?.match_focus ?? '')
        setTeamTalk(data.plan?.team_talk ?? '')
      })
      .catch(() => active && setMessage({ tone: 'error', text: t('networkFailed') }))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [teamId, t])

  useEffect(() => {
    if (picking === null) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPicking(null) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [picking])

  const live = (payload?.roster.length ?? 0) > 0
  const roster = useMemo(() => (payload?.roster.length ? payload.roster : draftPlayers), [payload, draftPlayers])
  const byId = useMemo(() => new Map(roster.map(member => [member.athlete_id, member])), [roster])
  const layout = formationSlots(board.formation)
  const onPitch = new Set(board.slots.filter(Boolean) as string[])
  const onBench = new Set(board.bench)
  const free = roster.filter(member => !onPitch.has(member.athlete_id) && !onBench.has(member.athlete_id))
  const starters = onPitch.size
  const name = (id: string) => byId.get(id)?.display_name ?? '—'

  const update = (next: BoardState) => { setBoard(next); setDirty(true); setMessage(null) }
  const pick = (athleteId: string) => { if (picking !== null) update(placePlayer(board, picking, athleteId)); setPicking(null) }
  // A draft name typed by the coach; placed straight into the open slot when there is one.
  const addDraftPlayer = () => {
    const typed = newName.trim().slice(0, DRAFT_NAME_MAX)
    if (!typed || draftPlayers.length >= DRAFT_PLAYERS_MAX) return
    const id = `draft-${Date.now().toString(36)}-${draftPlayers.length}`
    setDraftPlayers(current => [...current, { athlete_id: id, display_name: typed, profile_position: null, lineup_role: null, position: null, slot_order: null }])
    setNewName('')
    if (picking !== null) { update(placePlayer(board, picking, id)); setPicking(null) } else setDirty(true)
  }

  const save = async () => {
    if (!live) {
      const stored = storage.write(draftKey(teamId), writeDraft({ board, players: draftPlayers.map(player => ({ id: player.athlete_id, name: player.display_name })), focus: matchFocus, talk: teamTalk }))
      if (stored) setDirty(false)
      setMessage(stored ? { tone: 'ok', text: t('draftSaved') } : { tone: 'error', text: t('draftSaveFailed') })
      return
    }
    setSaving(true); setMessage(null)
    const profilePositions = Object.fromEntries(roster.map(member => [member.athlete_id, member.profile_position]))
    const response = await fetch('/api/match-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      teamId, formation: board.formation, matchFocus, teamTalk, players: boardToPlayers(board, profilePositions),
    }) }).catch(() => null)
    const result = await response?.json().catch(() => null) as { error?: string } | null
    setSaving(false)
    if (!response?.ok) { setMessage({ tone: 'error', text: result?.error ?? t('saveFailed') }); return }
    setDirty(false)
    setMessage({ tone: 'ok', text: t('saved') })
  }

  const slotPosition = picking !== null ? layout[picking]?.position : null
  const sheetGroups = picking === null ? [] : [
    { key: 'free', label: t('sheetFree'), ids: free.map(member => member.athlete_id) },
    { key: 'bench', label: t('sheetOnBench'), ids: board.bench },
    { key: 'pitch', label: t('sheetOnPitch'), ids: (board.slots.filter((id, index) => id && index !== picking) as string[]) },
  ].filter(group => group.ids.length > 0)
  const current = picking !== null ? board.slots[picking] : null

  return <div className="mp">
    {teams.length > 1 && <div className="mp-teams" role="group" aria-label={t('teamPick')}>
      {teams.map(team => <button type="button" key={team.id} className={team.id === teamId ? 'is-on' : undefined} aria-pressed={team.id === teamId} onClick={() => { if (team.id === teamId) return; setLoading(true); setMessage(null); setPicking(null); setTeamId(team.id) }}>
        <b>{team.name}</b><small>{team.tournaments?.[0]?.name ?? ''}</small>
      </button>)}
    </div>}
    {teams.length === 1 && <p className="mp-team-one"><b>{teams[0].name}</b>{teams[0].tournaments?.[0]?.name && <small> · {teams[0].tournaments[0].name}</small>}</p>}

    {loading ? <div className="mp-loading"><LoaderCircle size={22} className="mp-spin" aria-hidden="true" /> {tl('matchPlanBoard.loading')}</div>
      : <>
        {!live && <div className="mp-draft" role="note">
          <b>{teams.length ? t('draftTitle') : t('draftNoTeamTitle')}</b>
          <p>{teams.length ? t('draftText') : t('draftNoTeamText')}</p>
          <Link href={teams.length ? '/team-members' : '/tournaments?view=open'}>{teams.length ? t('invite') : t('noTeamsCta')} →</Link>
          {message?.tone === 'error' && !payload && <p className="mp-msg is-error" role="alert"><ShieldAlert size={17} aria-hidden="true" />{message.text}</p>}
        </div>}
        <section aria-label={tl('matchPlanBoard.formation')}>
          <h2 className="mp-h">{tl('matchPlanBoard.formation')}</h2>
          <div className="mp-formations">
            {BOARD_FORMATIONS.map(item => <button type="button" key={item} className={item === board.formation ? 'is-on' : undefined} aria-pressed={item === board.formation} onClick={() => item !== board.formation && update(changeFormation(board, item))}>
              {item}<small>{t('players', { count: formationSlots(item).length })}</small>
            </button>)}
          </div>
        </section>

        <section aria-label={tl('matchPlanBoard.lineup')}>
          <div className="mp-h-row"><h2 className="mp-h">{tl('matchPlanBoard.lineup')}</h2><span className="mp-count">{t('counts', { starters, slots: layout.length, bench: board.bench.length })}</span></div>
          <p className="mp-hint">{t('pitchHint')}</p>
          <div className="mp-pitch">
            <i className="mp-pitch-lines" aria-hidden="true" />
            {layout.map(slot => {
              const id = board.slots[slot.index]
              return <button type="button" key={slot.index} className={`mp-slot${id ? ' is-filled' : ''}${picking === slot.index ? ' is-picking' : ''}`} style={{ left: `${slot.x}%`, top: `${slot.y}%` }} onClick={() => setPicking(slot.index)}
                aria-label={id ? t('slotFilled', { position: t(`positionNames.${slot.position}`), name: name(id) }) : t('slotEmpty', { position: t(`positionNames.${slot.position}`) })}>
                <span className="mp-dot">{id ? [...shortName(name(id))][0] : <Plus size={18} aria-hidden="true" />}</span>
                <span className="mp-slot-name">{id ? shortName(name(id)) : slot.position}</span>
              </button>
            })}
          </div>
        </section>

        <section aria-label={t('benchTitle')}>
          <h2 className="mp-h">{t('benchTitle')}</h2>
          {board.bench.length
            ? <ul className="mp-bench">{board.bench.map(id => <li key={id}><span>{name(id)}</span><button type="button" aria-label={t('removeFromBench', { name: name(id) })} onClick={() => update(removePlayer(board, id))}><X size={15} aria-hidden="true" /></button></li>)}</ul>
            : <p className="mp-hint">{t('benchEmpty')}</p>}
        </section>

        <section aria-label={t('availableTitle')}>
          <h2 className="mp-h">{t('availableTitle')}</h2>
          {!live && <form className="mp-add" onSubmit={event => { event.preventDefault(); addDraftPlayer() }}>
            <label className="mp-sr" htmlFor="mp-add-name">{t('addName')}</label>
            <input id="mp-add-name" value={newName} maxLength={DRAFT_NAME_MAX} onChange={event => setNewName(event.target.value)} placeholder={t('addNamePlaceholder')} autoComplete="off" />
            <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!newName.trim() || draftPlayers.length >= DRAFT_PLAYERS_MAX}><Plus size={16} aria-hidden="true" />{t('add')}</button>
          </form>}
          {free.length
            ? <ul className="mp-free">{free.map(member => <li key={member.athlete_id}>
                <span><b>{member.display_name}</b>{member.profile_position && <small>{member.profile_position}</small>}</span>
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => update(benchPlayer(board, member.athlete_id))}>{t('toBench')}</button>
              </li>)}</ul>
            : <p className="mp-hint">{roster.length ? t('allPlaced') : t('noNamesYet')}</p>}
        </section>

        <details className="mp-notes" open={Boolean(matchFocus || teamTalk) || undefined}>
          <summary>{t('notesTitle')}</summary>
          <label><span>{tl('matchPlanBoard.focus')}</span><textarea value={matchFocus} onChange={event => { setMatchFocus(event.target.value); setDirty(true) }} maxLength={1000} rows={3} placeholder={t('focusPlaceholder')} /></label>
          <label><span>{tl('matchPlanBoard.talk')}</span><textarea value={teamTalk} onChange={event => { setTeamTalk(event.target.value); setDirty(true) }} maxLength={1000} rows={3} placeholder={t('talkPlaceholder')} /></label>
        </details>
        <p className="mp-hint">{t('notOfficial')}</p>

        <div className="mp-savebar">
          {message ? <p className={`mp-msg is-${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.tone === 'ok' ? <CheckCircle2 size={17} aria-hidden="true" /> : <ShieldAlert size={17} aria-hidden="true" />}{message.text}</p>
            : dirty && <p className="mp-msg">{t('unsaved')}</p>}
          <button type="button" className="ui-btn ui-btn-primary" disabled={saving} onClick={save}><Save size={17} aria-hidden="true" />{saving ? t('saving') : live ? t('save') : t('saveDraft')}</button>
        </div>
      </>}

    {picking !== null && <div className="mp-sheet-wrap" onClick={() => setPicking(null)}>
      <div className="mp-sheet" role="dialog" aria-modal="true" aria-labelledby="mp-sheet-title" onClick={event => event.stopPropagation()}>
        <div className="mp-sheet-head">
          <h2 id="mp-sheet-title">{t('sheetTitle', { position: slotPosition ? t(`positionNames.${slotPosition}`) : '' })}</h2>
          <button type="button" className="mp-close" aria-label={t('close')} onClick={() => setPicking(null)} autoFocus><X size={20} aria-hidden="true" /></button>
        </div>
        {current && <div className="mp-sheet-actions">
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => { update(benchPlayer(board, current)); setPicking(null) }}>{t('moveToBench')}</button>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => { update(removePlayer(board, current)); setPicking(null) }}>{t('removePlayer')}</button>
        </div>}
        {sheetGroups.map(group => <div key={group.key} className="mp-sheet-group">
          <h3>{group.label}</h3>
          <ul>{group.ids.map(id => <li key={id}><button type="button" onClick={() => pick(id)}>
            <b>{name(id)}</b>{byId.get(id)?.profile_position && <small>{byId.get(id)!.profile_position}</small>}
          </button></li>)}</ul>
        </div>)}
        {!live && <form className="mp-add" onSubmit={event => { event.preventDefault(); addDraftPlayer() }}>
          <label className="mp-sr" htmlFor="mp-sheet-name">{t('addName')}</label>
          <input id="mp-sheet-name" value={newName} maxLength={DRAFT_NAME_MAX} onChange={event => setNewName(event.target.value)} placeholder={t('addNamePlaceholder')} autoComplete="off" />
          <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!newName.trim() || draftPlayers.length >= DRAFT_PLAYERS_MAX}><Plus size={16} aria-hidden="true" />{t('add')}</button>
        </form>}
        {sheetGroups.length === 0 && live && <p className="mp-hint">{t('allPlaced')}</p>}
      </div>
    </div>}
  </div>
}
