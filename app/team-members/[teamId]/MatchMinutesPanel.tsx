'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save } from 'lucide-react'
import { MATCH_LENGTHS, cleanMinuteEntries, entryMinutes, type MinuteEntry } from '@/lib/match-minutes'
import { useApiErrorText } from '@/lib/use-api-error-text'

type Member = { athleteId: string; name: string }
export type MinutesMatch = { id: string; label: string; length: number | null; entries: MinuteEntry[] }
type Row = { status: 'none' | 'start' | 'sub'; on: string; off: string }

const rowsFrom = (members: Member[], entries: MinuteEntry[]) => Object.fromEntries(members.map(member => {
  const entry = entries.find(item => item.athleteId === member.athleteId)
  const row: Row = entry
    ? { status: entry.started ? 'start' : 'sub', on: entry.on === null ? '' : String(entry.on), off: entry.off === null ? '' : String(entry.off) }
    : { status: 'none', on: '', off: '' }
  return [member.athleteId, row]
}))
const minute = (text: string) => (text.trim() === '' ? null : Number(text))

// The coach's minutes sheet for one confirmed match (sql/74): match length, then for each
// member "didn't play / started / came on" with the minute on or off. Minutes are worked
// out, never typed. Saving replaces the whole sheet, so a correction never doubles a row.
export default function MatchMinutesPanel({ teamId, members, matches, ready }: { teamId: string; members: Member[]; matches: MinutesMatch[]; ready: boolean }) {
  const t = useTranslations('matchMinutes')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [matchId, setMatchId] = useState(matches[0]?.id ?? '')
  const current = matches.find(match => match.id === matchId)
  const [length, setLength] = useState(current?.length ?? 50)
  const [rows, setRows] = useState<Record<string, Row>>(() => rowsFrom(members, current?.entries ?? []))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  if (!members.length) return null
  if (!ready) return <p className="tp-empty">{t('notReady')}</p>
  if (!matches.length) return <p className="tp-empty">{t('noMatches')}</p>

  const pick = (id: string) => {
    const match = matches.find(item => item.id === id)
    setMatchId(id); setLength(match?.length ?? 50); setRows(rowsFrom(members, match?.entries ?? [])); setMessage(null)
  }
  const change = (athleteId: string, update: Partial<Row>) => { setRows(all => ({ ...all, [athleteId]: { ...all[athleteId], ...update } })); setMessage(null) }
  const entries = members
    .filter(member => rows[member.athleteId]?.status !== 'none')
    .map(member => {
      const row = rows[member.athleteId]
      return { athleteId: member.athleteId, started: row.status === 'start', on: row.status === 'sub' ? minute(row.on) : null, off: minute(row.off) }
    })
  const clean = cleanMinuteEntries(entries, length)

  const save = async () => {
    if (busy) return
    if (!clean) { setMessage({ tone: 'error', text: t('invalid') }); return }
    setBusy(true); setMessage(null)
    const response = await fetch('/api/match-minutes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', data: { matchId, teamId, length, entries: clean } }),
    }).catch(() => null)
    const body = response ? await response.json().catch(() => null) : null
    setBusy(false)
    if (!response?.ok) { setMessage({ tone: 'error', text: errorText(body, t('saveFailed')) }); return }
    setMessage({ tone: 'ok', text: t('saved') })
    router.refresh()
  }

  return (
    <div className="ui-card te-form">
      <label>{t('pickMatch')}
        <select className="mm-select" value={matchId} onChange={event => pick(event.target.value)}>
          {matches.map(match => <option key={match.id} value={match.id}>{match.label}{match.length ? ` · ${t('recorded')}` : ''}</option>)}
        </select>
      </label>
      <div className="tp-chips is-wrap" role="group" aria-label={t('length')}>
        {MATCH_LENGTHS.map(value => <button type="button" key={value} className={length === value ? 'is-on' : undefined} aria-pressed={length === value} onClick={() => { setLength(value); setMessage(null) }}>{t('minutesUnit', { count: value })}</button>)}
      </div>
      {members.map(member => {
        const row = rows[member.athleteId] ?? { status: 'none', on: '', off: '' }
        const entry = entries.find(item => item.athleteId === member.athleteId)
        const played = entry && clean ? entryMinutes(entry, length) : null
        return <div className="mm-row" key={member.athleteId}>
          <div className="te-top"><b>{member.name}</b>{played !== null && <span className="tn-when">{t('played', { count: played })}</span>}</div>
          <div className="tt-loads mm-status" role="group" aria-label={member.name}>
            {(['none', 'start', 'sub'] as const).map(status => <button type="button" key={status} className={row.status === status ? 'is-on is-load-2' : undefined} aria-pressed={row.status === status}
              onClick={() => change(member.athleteId, { status, on: status === 'sub' ? row.on : '', off: status === 'none' ? '' : row.off })}>{t(`status.${status}`)}</button>)}
          </div>
          {row.status !== 'none' && <div className="mm-minutes">
            {row.status === 'sub' && <label>{t('on')}<input inputMode="numeric" value={row.on} onChange={event => change(member.athleteId, { on: event.target.value.replace(/\D/g, '').slice(0, 3) })} /></label>}
            <label>{t('off')}<input inputMode="numeric" placeholder={t('offHint')} value={row.off} onChange={event => change(member.athleteId, { off: event.target.value.replace(/\D/g, '').slice(0, 3) })} /></label>
          </div>}
        </div>
      })}
      <p className="tp-note">{t('rule')}</p>
      {message && <p className={message.tone === 'ok' ? 'tp-ok' : 'tp-alert'} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
      <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={save}><Save size={16} aria-hidden="true" />{busy ? t('saving') : t('save')}</button>
    </div>
  )
}
