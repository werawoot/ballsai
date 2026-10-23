'use client'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { CheckCircle2, Circle, GripVertical, LoaderCircle, Plus, RotateCcw, Save, Search, ShieldAlert, ShieldHalf, Sparkles, Trash2, X } from 'lucide-react'
import { BOARD_FORMATIONS, DEFAULT_FORMATION, DRAFT_NAME_MAX, DRAFT_PLAYERS_MAX, autoFill, benchPlayer, boardLayout, clearPitch, draftKey, dropOnPitch, readDraft, resetPoints, writeDraft, boardFromRoster, boardToPlayers, changeFormation, formationSlots, placePlayer, removePlayer, type BoardPosition, type BoardState } from '@/lib/match-plan-board'
import './match-plan.css'

// The coach's pitch board (lib/match-plan-board), on the light glass design (ADR-014). Pick a
// team, pick a shape, tap a spot on the pitch and pick who plays there, or drag: a player
// anywhere on the pitch (the point is saved by sql/68), onto another player to swap, or a name
// from the list onto the pitch; a player dragged from the pitch onto the list goes to the
// bench. Tapping keeps working for anyone who cannot drag. "Auto-arrange" fills only the
// empty spots, by each player's own profile position. Only members who accepted the team
// invite can be saved (get_match_plan_safely). Before that -- no team yet, or nobody has
// accepted -- the coach plans a draft with names typed in, kept only in this browser
// (lib/match-plan-board readDraft). A plan is preparation, never a result: it changes no
// rating, XP or badge, and it is not sent to an organizer.

type Tournament = { name: string; start_date: string | null }
type TournamentRelation = Tournament[] | Tournament | null
export type MatchPlanTeam = { id: string; name: string; status: string; tournament_id: string; tournaments: TournamentRelation }
type RosterMember = { athlete_id: string; display_name: string; profile_position: string | null; lineup_role: 'starter' | 'substitute' | null; position: BoardPosition | null; slot_order: number | null; pos_x?: number | null; pos_y?: number | null; avatar_url?: string | null }
type Plan = { id: string; formation: string; match_focus: string; team_talk: string; updated_at: string }
type PlanPayload = { plan: Plan | null; roster: RosterMember[] }
type PositionFilter = 'all' | BoardPosition

const POSITIONS: readonly BoardPosition[] = ['GK', 'DF', 'MF', 'FW']
const emptyBoard = (formation = DEFAULT_FORMATION): BoardState => ({ formation, slots: Array(formationSlots(formation).length).fill(null), bench: [] })
// A short name for a spot on the pitch: skip a title such as "ด.ช." and keep one word.
const shortName = (name: string) => name.trim().split(/\s+/).find(part => !part.endsWith('.')) ?? name
const initial = (name: string) => [...shortName(name)][0] ?? '?'
const ownPosition = (value: string | null | undefined): BoardPosition | null => (value && (POSITIONS as readonly string[]).includes(value) ? value as BoardPosition : null)
const tournamentName = (team: MatchPlanTeam | undefined) => (Array.isArray(team?.tournaments) ? team.tournaments[0]?.name : team?.tournaments?.name) ?? ''
const storage = {
  read: (key: string) => { try { return window.localStorage.getItem(key) } catch { return null } },
  write: (key: string, value: string) => { try { window.localStorage.setItem(key, value); return true } catch { return false } },
}

// A player's face: their own photo when the viewer may see it (signed by the API), else the
// first letter of their name. Never a stand-in picture.
function Face({ member, name, size }: { member: RosterMember | undefined; name: string; size: number }) {
  return <span className="mp-face" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {member?.avatar_url ? <img src={member.avatar_url} alt="" width={size} height={size} /> : initial(name)}
  </span>
}

export default function MatchPlanClient({ teams, head, toolbar, pagination, empty = false, emptyText = '' }: {
  teams: MatchPlanTeam[]
  head?: ReactNode
  toolbar?: ReactNode
  pagination?: ReactNode
  /** A search that found no team: the board gives way to emptyText. */
  empty?: boolean
  emptyText?: string
}) {
  const t = useTranslations('matchPlan')
  const tl = useTranslations('labels')
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '')
  const [payload, setPayload] = useState<PlanPayload | null>(null)
  const [loading, setLoading] = useState(!empty)
  const [draftPlayers, setDraftPlayers] = useState<RosterMember[]>([])
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [board, setBoard] = useState<BoardState>(emptyBoard())
  const [matchFocus, setMatchFocus] = useState('')
  const [teamTalk, setTeamTalk] = useState('')
  const [picking, setPicking] = useState<number | null>(null)
  const [choosingTeam, setChoosingTeam] = useState(false)
  const [dirty, setDirty] = useState(false)
  // Whether what is on the board was saved at some point (a stored plan or draft counts).
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<'team' | 'bench'>('team')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PositionFilter>('all')
  const [message, setMessage] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null)
  // A drag in progress: who, where the pointer started and is now. Moving under 6px is a tap.
  const [drag, setDrag] = useState<{ id: string; startX: number; startY: number; x: number; y: number; moved: boolean } | null>(null)
  const pitchRef = useRef<HTMLDivElement>(null)
  const dragged = useRef(false)
  const pointerY = useRef(0)

  // On a phone the list sits below the pitch: holding a dragged name near the top or bottom
  // edge scrolls the page, so it can reach the pitch (or the list) without letting go.
  const dragging = Boolean(drag?.moved)
  useEffect(() => {
    if (!dragging) return
    const timer = window.setInterval(() => {
      const y = pointerY.current, edge = 90, bottomEdge = window.innerHeight - 170
      if (y < edge) window.scrollBy(0, -Math.ceil((edge - y) / 6))
      else if (y > bottomEdge) window.scrollBy(0, Math.ceil((y - bottomEdge) / 6))
    }, 16)
    return () => window.clearInterval(timer)
  }, [dragging])

  useEffect(() => {
    if (empty) return
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
          setSaved(Boolean(draft))
          return
        }
        const formation = data.plan?.formation && (BOARD_FORMATIONS as readonly string[]).includes(data.plan.formation) ? data.plan.formation : DEFAULT_FORMATION
        setBoard(boardFromRoster(data.roster, formation))
        setMatchFocus(data.plan?.match_focus ?? '')
        setTeamTalk(data.plan?.team_talk ?? '')
        setSaved(Boolean(data.plan))
      })
      .catch(() => active && setMessage({ tone: 'error', text: t('networkFailed') }))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [teamId, t, empty])

  useEffect(() => {
    if (picking === null && !choosingTeam) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setPicking(null); setChoosingTeam(false) } }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [picking, choosingTeam])

  const live = (payload?.roster.length ?? 0) > 0
  const roster = useMemo(() => (payload?.roster.length ? payload.roster : draftPlayers), [payload, draftPlayers])
  const byId = useMemo(() => new Map(roster.map(member => [member.athlete_id, member])), [roster])
  const layout = boardLayout(board)
  const onPitch = new Set(board.slots.filter(Boolean) as string[])
  const onBench = new Set(board.bench)
  const free = roster.filter(member => !onPitch.has(member.athlete_id) && !onBench.has(member.athlete_id))
  const starters = onPitch.size
  const name = (id: string) => byId.get(id)?.display_name ?? '—'
  const team = teams.find(item => item.id === teamId)
  const full = starters === layout.length
  const upToDate = saved && !dirty

  const update = (next: BoardState) => { setBoard(next); setDirty(true); setMessage(null) }
  const startDrag = (athleteId: string) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragged.current = false
    setDrag({ id: athleteId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false })
  }
  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag) return
    pointerY.current = event.clientY
    const moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6
    setDrag({ ...drag, x: event.clientX, y: event.clientY, moved })
  }
  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag) return
    const current = drag
    setDrag(null)
    if (!current.moved) return
    // Swallow only the click this same release fires on a spot, never a later tap.
    dragged.current = true
    window.setTimeout(() => { dragged.current = false }, 0)
    const box = pitchRef.current?.getBoundingClientRect()
    if (box && event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom) {
      update(dropOnPitch(board, current.id, (event.clientX - box.left) / box.width * 100, (event.clientY - box.top) / box.height * 100))
    } else if ((board.slots.includes(current.id) || tab === 'bench') && document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-drop="bench"]')) {
      // Onto the list: a starter leaves the pitch for the bench; a name dropped back where it
      // came from on the team tab stays free.
      update(benchPlayer(board, current.id))
    }
  }
  const dragHandlers = (athleteId: string) => ({ onPointerDown: startDrag(athleteId), onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: () => setDrag(null) })
  const pick = (athleteId: string) => { if (picking !== null) update(placePlayer(board, picking, athleteId)); setPicking(null) }
  // A draft name typed by the coach; placed straight into the open spot when there is one.
  const addDraftPlayer = () => {
    const typed = newName.trim().slice(0, DRAFT_NAME_MAX)
    if (!typed || draftPlayers.length >= DRAFT_PLAYERS_MAX) return
    const id = `draft-${Date.now().toString(36)}-${draftPlayers.length}`
    setDraftPlayers(current => [...current, { athlete_id: id, display_name: typed, profile_position: null, lineup_role: null, position: null, slot_order: null }])
    setNewName('')
    if (picking !== null) { update(placePlayer(board, picking, id)); setPicking(null) } else setDirty(true)
  }
  const arrange = () => {
    const next = autoFill(board, roster)
    if (next === board) { setMessage({ tone: 'info', text: t('autoFillNone') }); return }
    setBoard(next); setDirty(true)
    setMessage({ tone: 'info', text: t('autoFillDone') })
  }
  const chooseTeam = (id: string) => {
    setChoosingTeam(false)
    if (id === teamId) return
    setLoading(true); setMessage(null); setPicking(null); setTeamId(id)
  }

  const save = async () => {
    if (!live) {
      const stored = storage.write(draftKey(teamId), writeDraft({ board, players: draftPlayers.map(player => ({ id: player.athlete_id, name: player.display_name })), focus: matchFocus, talk: teamTalk }))
      if (stored) { setDirty(false); setSaved(true) }
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
    setDirty(false); setSaved(true)
    setMessage({ tone: 'ok', text: t('saved') })
  }

  const slotPosition = picking !== null ? layout[picking]?.position : null
  const sheetGroups = picking === null ? [] : [
    { key: 'free', label: t('sheetFree'), ids: free.map(member => member.athlete_id) },
    { key: 'bench', label: t('sheetOnBench'), ids: board.bench },
    { key: 'pitch', label: t('sheetOnPitch'), ids: (board.slots.filter((id, index) => id && index !== picking) as string[]) },
  ].filter(group => group.ids.length > 0)
  const current = picking !== null ? board.slots[picking] : null

  // The list on the right: everyone in the team (or only the bench), searched and filtered.
  const needle = query.trim().toLocaleLowerCase('th')
  const listIds = (tab === 'bench' ? board.bench : roster.map(member => member.athlete_id))
    .filter(id => !needle || name(id).toLocaleLowerCase('th').includes(needle))
    .filter(id => filter === 'all' || ownPosition(byId.get(id)?.profile_position) === filter)
  const slotOf = (id: string) => board.slots.indexOf(id)

  const steps = [
    { title: t('step1Title'), text: t('step1Text', { formation: board.formation, count: layout.length }), done: true },
    { title: t('step2Title'), text: t('step2Text', { starters, slots: layout.length, bench: board.bench.length }), done: full },
    { title: t('step3Title'), text: upToDate ? (live ? t('step3Saved') : t('step3Draft')) : t('step3Unsaved'), done: upToDate },
  ]
  const currentStep = steps.findIndex(step => !step.done)
  const checks = [
    { label: t('checkFormation'), done: true },
    { label: t('checkFull', { slots: layout.length }), done: full },
    { label: t('checkBench'), done: board.bench.length > 0 },
    { label: t('checkSaved'), done: upToDate },
  ]

  const addForm = (idSuffix: string) => <form className="mp-add" onSubmit={event => { event.preventDefault(); addDraftPlayer() }}>
    <label className="mp-sr" htmlFor={`mp-add-${idSuffix}`}>{t('addName')}</label>
    <input id={`mp-add-${idSuffix}`} value={newName} maxLength={DRAFT_NAME_MAX} onChange={event => setNewName(event.target.value)} placeholder={t('addNamePlaceholder')} autoComplete="off" />
    <button type="submit" className="mp-btn mp-btn-green" disabled={!newName.trim() || draftPlayers.length >= DRAFT_PLAYERS_MAX}><Plus size={16} aria-hidden="true" />{t('add')}</button>
  </form>

  return <div className="mp">
    <section className="mp-hero">
      <div className="mp-hero-inner">
        <div className="mp-hero-text">{head}</div>
        <div className="mp-team-card">
          <span className="mp-crest" aria-hidden="true"><ShieldHalf size={26} /></span>
          <span className="mp-team-text">
            <b>{team?.name ?? t('noTeamCard')}</b>
            <small>{[tournamentName(team), live ? t('teamPlayers', { count: roster.length }) : ''].filter(Boolean).join(' · ')}</small>
          </span>
          {teams.length > 1 && <button type="button" className="mp-btn mp-btn-glass" aria-haspopup="dialog" onClick={() => setChoosingTeam(true)}>{t('changeTeam')}</button>}
        </div>
      </div>
    </section>

    <div className="mp-wrap">
      {toolbar && <div className="mp-toolbar gl-card">{toolbar}</div>}
      {empty ? <p className="mp-empty-search gl-card">{emptyText}</p>
        : loading ? <div className="mp-loading gl-card"><LoaderCircle size={22} className="mp-spin" aria-hidden="true" /> {tl('matchPlanBoard.loading')}</div>
        : <>
          {!live && <div className="mp-draft" role="note">
            <b>{teams.length ? t('draftTitle') : t('draftNoTeamTitle')}</b>
            <p>{teams.length ? t('draftText') : t('draftNoTeamText')}</p>
            <Link href={teams.length ? '/team-members' : '/tournaments?view=open'}>{teams.length ? t('invite') : t('noTeamsCta')} →</Link>
            {message?.tone === 'error' && !payload && <p className="mp-msg is-error" role="alert"><ShieldAlert size={17} aria-hidden="true" />{message.text}</p>}
          </div>}

          <div className="mp-board">
            <ol className="mp-steps gl-card" aria-label={t('stepsLabel')}>
              {steps.map((step, index) => <li key={step.title} className={step.done ? 'is-done' : index === currentStep ? 'is-now' : undefined} aria-current={index === currentStep ? 'step' : undefined}>
                <span className="mp-step-no" aria-hidden="true">{step.done ? <CheckCircle2 size={20} /> : index + 1}</span>
                <span className="mp-step-text"><b>{step.title}<span className="mp-sr"> ({step.done ? t('checkDone') : t('checkTodo')})</span></b><small>{step.text}</small></span>
              </li>)}
            </ol>

            <section className="mp-center" aria-label={tl('matchPlanBoard.lineup')}>
              <div className="mp-card gl-card">
                <div className="mp-h-row">
                  <h2 className="mp-h">{t('step1Title')}</h2>
                  <button type="button" className="mp-btn mp-btn-outline" onClick={arrange} disabled={!roster.length}><Sparkles size={16} aria-hidden="true" />{t('autoFill')}</button>
                </div>
                <div className="mp-formations" role="group" aria-label={tl('matchPlanBoard.formation')}>
                  {BOARD_FORMATIONS.map(item => <button type="button" key={item} className={item === board.formation ? 'is-on' : undefined} aria-pressed={item === board.formation} onClick={() => item !== board.formation && update(changeFormation(board, item))}>
                    <span className="mp-mini" aria-hidden="true">{formationSlots(item).map(slot => <i key={slot.index} style={{ left: `${slot.x}%`, top: `${slot.y}%` }} />)}</span>
                    <b>{item}</b><small>{t('players', { count: formationSlots(item).length })}</small>
                  </button>)}
                </div>
              </div>

              <div className={`mp-pitch${drag?.moved ? ' is-dropping' : ''}`} ref={pitchRef}>
                <i className="mp-pitch-lines" aria-hidden="true"><i className="mp-box is-top" /><i className="mp-box is-bottom" /><i className="mp-centre" /></i>
                <span className="mp-pitch-badge">{board.formation} <small>({t('players', { count: layout.length })})</small></span>
                <button type="button" className="mp-pitch-clear" onClick={() => update(clearPitch(board))} disabled={!starters}><Trash2 size={15} aria-hidden="true" />{t('clearPitch')}</button>
                {layout.map(slot => {
                  const id = board.slots[slot.index]
                  return <button type="button" key={slot.index} className={`mp-slot${id ? ' is-filled' : ''}${picking === slot.index ? ' is-picking' : ''}${drag?.moved && drag.id === id ? ' is-dragging' : ''}`} style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                    onClick={() => { if (dragged.current) { dragged.current = false; return } setPicking(slot.index) }} {...(id ? dragHandlers(id) : {})}
                    aria-label={id ? t('slotFilled', { position: t(`positionNames.${slot.position}`), name: name(id) }) : t('slotEmpty', { position: t(`positionNames.${slot.position}`) })}>
                    {id ? <Face member={byId.get(id)} name={name(id)} size={40} /> : <span className="mp-plus"><Plus size={18} aria-hidden="true" /></span>}
                    <span className="mp-slot-name">{id ? shortName(name(id)) : slot.position}</span>
                  </button>
                })}
              </div>
              <p className="mp-hint">{t('pitchHint')}</p>
              {board.points && <button type="button" className="mp-reset" onClick={() => update(resetPoints(board))}><RotateCcw size={15} aria-hidden="true" />{t('resetPoints')}</button>}

              <details className="mp-notes gl-card" open={Boolean(matchFocus || teamTalk) || undefined}>
                <summary>{t('notesTitle')}</summary>
                <label><span>{tl('matchPlanBoard.focus')}</span><textarea value={matchFocus} onChange={event => { setMatchFocus(event.target.value); setDirty(true) }} maxLength={1000} rows={3} placeholder={t('focusPlaceholder')} /></label>
                <label><span>{tl('matchPlanBoard.talk')}</span><textarea value={teamTalk} onChange={event => { setTeamTalk(event.target.value); setDirty(true) }} maxLength={1000} rows={3} placeholder={t('talkPlaceholder')} /></label>
              </details>
            </section>

            <section className={`mp-list gl-card${drag?.moved && (board.slots.includes(drag.id) || tab === 'bench') ? ' is-target' : ''}`} aria-label={t('listLabel')} data-drop="bench">
              <div className="mp-tabs" role="group" aria-label={t('listLabel')}>
                <button type="button" aria-pressed={tab === 'team'} className={tab === 'team' ? 'is-on' : undefined} onClick={() => setTab('team')}>{t('tabTeam', { count: roster.length })}</button>
                <button type="button" aria-pressed={tab === 'bench'} className={tab === 'bench' ? 'is-on' : undefined} onClick={() => setTab('bench')}>{t('tabBench', { count: board.bench.length })}</button>
              </div>
              <div className="mp-find">
                <label className="mp-search"><Search size={16} aria-hidden="true" /><span className="mp-sr">{t('searchPlayer')}</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('searchPlayer')} autoComplete="off" /></label>
                <label className="mp-filter"><span className="mp-sr">{t('filterLabel')}</span>
                  <select value={filter} onChange={event => setFilter(event.target.value as PositionFilter)}>
                    <option value="all">{t('filterAll')}</option>
                    {POSITIONS.map(position => <option key={position} value={position}>{position} · {t(`positionNames.${position}`)}</option>)}
                  </select>
                </label>
              </div>
              {!live && tab === 'team' && addForm('list')}
              {listIds.length
                ? <ul className="mp-rows">{listIds.map(id => {
                    const member = byId.get(id)
                    const own = ownPosition(member?.profile_position)
                    const slot = slotOf(id)
                    const state = slot >= 0 ? t('stateOnPitch', { position: t(`positionNames.${layout[slot]?.position ?? 'MF'}`) }) : onBench.has(id) ? t('stateBench') : t('stateFree')
                    return <li key={id} className={slot >= 0 ? 'is-placed' : undefined}>
                      <Face member={member} name={name(id)} size={40} />
                      <span className={`mp-pos${own ? ` is-${own}` : ''}`}>{own ?? t('noPosition')}</span>
                      <span className="mp-row-name"><b>{name(id)}</b><small>{state}</small></span>
                      {onBench.has(id)
                        ? <button type="button" className="mp-icon-btn" aria-label={t('removeFromBench', { name: name(id) })} onClick={() => update(removePlayer(board, id))}><X size={16} aria-hidden="true" /></button>
                        : slot < 0 && <button type="button" className="mp-btn mp-btn-small" onClick={() => update(benchPlayer(board, id))}>{t('toBench')}</button>}
                      <span className="mp-grip" aria-hidden="true" {...dragHandlers(id)}><GripVertical size={18} /></span>
                    </li>
                  })}</ul>
                : <p className="mp-hint mp-list-empty">{needle || filter !== 'all' ? t('noMatch') : tab === 'bench' ? t('benchEmpty') : roster.length ? t('allPlaced') : t('noNamesYet')}</p>}
              <p className="mp-hint">{t('listHint')}</p>
            </section>

            <aside className="mp-check gl-card" aria-label={t('checkTitle')}>
              <h2 className="mp-h">{t('checkTitle')}</h2>
              <ul>{checks.map(check => <li key={check.label} className={check.done ? 'is-done' : undefined}>
                {check.done ? <CheckCircle2 size={19} aria-hidden="true" /> : <Circle size={19} aria-hidden="true" />}
                <span>{check.label}<span className="mp-sr"> ({check.done ? t('checkDone') : t('checkTodo')})</span></span>
              </li>)}</ul>
              <p className="mp-hint">{t('notOfficial')}</p>
            </aside>
          </div>

          <div className="mp-savebar">
            {message ? <p className={`mp-msg is-${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.tone === 'error' ? <ShieldAlert size={17} aria-hidden="true" /> : message.tone === 'info' ? <Sparkles size={17} aria-hidden="true" /> : <CheckCircle2 size={17} aria-hidden="true" />}{message.text}</p>
              : dirty && <p className="mp-msg">{t('unsaved')}</p>}
            <button type="button" className="mp-btn mp-btn-green mp-save" disabled={saving} onClick={save}><Save size={18} aria-hidden="true" />{saving ? t('saving') : live ? t('save') : t('saveDraft')}</button>
          </div>
        </>}
      {pagination}
    </div>

    {drag?.moved && <span className="mp-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">{initial(name(drag.id))}</span>}
    {choosingTeam && <div className="mp-sheet-wrap" onClick={() => setChoosingTeam(false)}>
      <div className="mp-sheet" role="dialog" aria-modal="true" aria-labelledby="mp-team-title" onClick={event => event.stopPropagation()}>
        <div className="mp-sheet-head">
          <h2 id="mp-team-title">{t('teamPick')}</h2>
          <button type="button" className="mp-close" aria-label={t('close')} onClick={() => setChoosingTeam(false)} autoFocus><X size={20} aria-hidden="true" /></button>
        </div>
        <div className="mp-sheet-group"><ul>{teams.map(item => <li key={item.id}><button type="button" aria-pressed={item.id === teamId} onClick={() => chooseTeam(item.id)}>
          <b>{item.name}</b>{item.id === teamId ? <CheckCircle2 size={18} aria-hidden="true" /> : <small>{tournamentName(item)}</small>}
        </button></li>)}</ul></div>
      </div>
    </div>}
    {picking !== null && <div className="mp-sheet-wrap" onClick={() => setPicking(null)}>
      <div className="mp-sheet" role="dialog" aria-modal="true" aria-labelledby="mp-sheet-title" onClick={event => event.stopPropagation()}>
        <div className="mp-sheet-head">
          <h2 id="mp-sheet-title">{t('sheetTitle', { position: slotPosition ? t(`positionNames.${slotPosition}`) : '' })}</h2>
          <button type="button" className="mp-close" aria-label={t('close')} onClick={() => setPicking(null)} autoFocus><X size={20} aria-hidden="true" /></button>
        </div>
        {current && <div className="mp-sheet-actions">
          <button type="button" className="mp-btn mp-btn-outline" onClick={() => { update(benchPlayer(board, current)); setPicking(null) }}>{t('moveToBench')}</button>
          <button type="button" className="mp-btn mp-btn-outline" onClick={() => { update(removePlayer(board, current)); setPicking(null) }}>{t('removePlayer')}</button>
        </div>}
        {sheetGroups.map(group => <div key={group.key} className="mp-sheet-group">
          <h3>{group.label}</h3>
          <ul>{group.ids.map(id => <li key={id}><button type="button" onClick={() => pick(id)}>
            <span className="mp-sheet-who"><Face member={byId.get(id)} name={name(id)} size={34} /><b>{name(id)}</b></span>{byId.get(id)?.profile_position && <small>{byId.get(id)!.profile_position}</small>}
          </button></li>)}</ul>
        </div>)}
        {!live && addForm('sheet')}
        {sheetGroups.length === 0 && live && <p className="mp-hint">{t('allPlaced')}</p>}
      </div>
    </div>}
  </div>
}
