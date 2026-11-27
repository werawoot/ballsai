'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Flame, Target, Trash2 } from 'lucide-react'
import { useApiErrorText, type ApiErrorBody } from '@/lib/use-api-error-text'
import { GOAL_LIMITS, goalProgress, paceText, parseRun, weekStreak, type RunForm, type RunGoal, type RunWeek } from '@/lib/running'
import type { RunRow } from '@/lib/running-data'

// Running mode V1 (ADR-016, sql/108): log a run, set a weekly goal, see the weeks and the history.
// Anyone signed in, alone. Each save carries a request id, so a double tap or a retry is one run
// (add_my_run). The panel shows what was just saved itself and refreshes the page behind it, so a
// navigation Next cancels (docs/e2e.md) never hides a saved run.

const km = (metres: number) => (Math.round(metres / 100) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 })
const newRequest = () => crypto.randomUUID()

export default function RunPanel({ today, runs, weeks, goal, page, hasNext, pagePath }: {
  today: string
  runs: RunRow[]
  weeks: RunWeek[]
  goal: RunGoal | null
  page: number
  hasNext: boolean
  // The page's address without runPage, e.g. /training?band=u10_u13&tab=run
  pagePath: string
}) {
  const t = useTranslations('training.run')
  const locale = useLocale()
  const router = useRouter()
  const errorText = useApiErrorText()
  const [form, setForm] = useState<RunForm>({ date: today, km: '', minutes: '', seconds: '' })
  const [requestId, setRequestId] = useState(newRequest)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [added, setAdded] = useState<RunRow[]>([])
  const [removed, setRemoved] = useState<string[]>([])
  const [goalForm, setGoalForm] = useState({ unit: goal?.unit ?? 'runs', target: String(goal?.target ?? 3) })
  const [savedGoal, setSavedGoal] = useState<RunGoal | null>(goal)

  const shown = [...added.filter(run => !runs.some(row => row.id === run.id)), ...runs].filter(run => !removed.includes(run.id))
  // This week as the database counted it, plus what was added or removed on this screen since.
  const thisWeek: RunWeek | undefined = weeks[0] && {
    ...weeks[0],
    runs: weeks[0].runs + added.filter(run => run.run_date >= weeks[0].weekStart && !runs.some(row => row.id === run.id)).length,
    distanceM: weeks[0].distanceM + added.filter(run => run.run_date >= weeks[0].weekStart && !runs.some(row => row.id === run.id)).reduce((sum, run) => sum + run.distance_m, 0),
  }
  const allWeeks = thisWeek ? [thisWeek, ...weeks.slice(1)] : weeks
  const progress = savedGoal && thisWeek ? goalProgress(savedGoal, thisWeek) : null
  const streak = weekStreak(savedGoal, allWeeks)
  const pageHref = (next: number) => `${pagePath}${pagePath.includes('?') ? '&' : '?'}runPage=${next}`
  const dateText = (day: string) => new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))

  const post = async (body: Record<string, unknown>): Promise<{ problem: string | null; id?: string }> => {
    const response = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const result = (await response?.json().catch(() => null)) as (ApiErrorBody & { id?: string }) | null
    if (response?.ok) return { problem: null, id: result?.id }
    return { problem: errorText(result as ApiErrorBody, t('failed')) }
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    const parsed = parseRun(form, today)
    if (!parsed.ok) return setMessage({ kind: 'error', text: errorText({ code: parsed.problem } as ApiErrorBody, t('failed')) })
    setSaving(true)
    setMessage(null)
    const { problem, id } = await post({ action: 'add', requestId, ...form })
    setSaving(false)
    if (problem) return setMessage({ kind: 'error', text: problem })
    setAdded(current => [{ id: id ?? requestId, run_date: parsed.run.runDate, distance_m: parsed.run.distanceM, duration_s: parsed.run.durationS }, ...current])
    setForm({ date: today, km: '', minutes: '', seconds: '' })
    setRequestId(newRequest())
    setMessage({ kind: 'ok', text: t('saved') })
    router.refresh()
  }

  const remove = async (id: string) => {
    const { problem } = await post({ action: 'remove', id })
    if (problem) return setMessage({ kind: 'error', text: problem })
    setRemoved(current => [...current, id])
    router.refresh()
  }

  const saveGoal = async (event: React.FormEvent) => {
    event.preventDefault()
    const next = { unit: goalForm.unit as RunGoal['unit'], target: Number(goalForm.target) }
    const { problem } = await post({ action: 'goal', ...next })
    if (problem) return setMessage({ kind: 'error', text: problem })
    setSavedGoal(next)
    router.refresh()
  }

  return <section className="tg-run" aria-labelledby="tg-run-title">
    <h2 id="tg-run-title" className="tg-h2">{t('title')}</h2>
    <p className="tg-run-lead">{t('lead')}</p>

    <div className="tg-run-summary">
      <div className="tg-run-stat">
        <small>{t('thisWeek')}</small>
        <b>{t('weekLine', { runs: thisWeek?.runs ?? 0, km: km(thisWeek?.distanceM ?? 0) })}</b>
        {progress && <span className={`tg-chip${progress.met ? ' is-on' : ''}`}><Target size={13} aria-hidden="true" />{progress.met ? t('goalMet') : t('goalLine', { done: progress.done, target: progress.target, unit: savedGoal?.unit === 'km' ? t('unitKm') : t('unitRuns') })}</span>}
      </div>
      {streak > 0 && <div className="tg-run-stat"><small><Flame size={14} aria-hidden="true" /></small><b>{t('streak', { count: streak })}</b></div>}
    </div>

    <form className="tg-run-form" method="post" onSubmit={save}>
      <h3>{t('add')}</h3>
      <label>{t('date')}<input max={today} min="2020-01-01" onChange={event => setForm({ ...form, date: event.target.value })} required type="date" value={form.date} /></label>
      <label>{t('km')}<input inputMode="decimal" onChange={event => setForm({ ...form, km: event.target.value })} placeholder="5.0" required value={form.km} /></label>
      <div className="tg-run-time">
        <label>{t('minutes')}<input inputMode="numeric" onChange={event => setForm({ ...form, minutes: event.target.value })} placeholder="30" required value={form.minutes} /></label>
        <label>{t('seconds')}<input inputMode="numeric" onChange={event => setForm({ ...form, seconds: event.target.value })} placeholder="0" value={form.seconds} /></label>
      </div>
      <button className="ui-btn ui-btn-primary" disabled={saving} type="submit">{saving ? t('saving') : t('save')}</button>
      {message && <p className={message.kind === 'ok' ? 'tg-run-ok' : 'tg-note is-error'} role={message.kind === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
    </form>

    <form className="tg-run-goal" method="post" onSubmit={saveGoal}>
      <h3>{t('goalTitle')}</h3>
      {!savedGoal && <p className="tg-run-muted">{t('goalNone')}</p>}
      <div className="tg-run-time">
        <label>{t('goalTitle')}<input inputMode="numeric" max={GOAL_LIMITS[goalForm.unit as RunGoal['unit']]} min={1} onChange={event => setGoalForm({ ...goalForm, target: event.target.value })} type="number" value={goalForm.target} /></label>
        <label>{t('goalUnit')}<select onChange={event => setGoalForm({ ...goalForm, unit: event.target.value as RunGoal['unit'] })} value={goalForm.unit}>
          <option value="runs">{t('unitRuns')}</option>
          <option value="km">{t('unitKm')}</option>
        </select></label>
      </div>
      <button className="ui-btn ui-btn-ghost" type="submit">{t('goalSave')}</button>
    </form>

    {allWeeks.length > 0 && <>
      <h3 className="tg-run-h3">{t('weeksTitle')}</h3>
      <ol className="tg-run-weeks">
        {allWeeks.map(week => {
          const met = savedGoal ? goalProgress(savedGoal, week).met : false
          return <li key={week.weekStart} className={met ? 'is-met' : undefined}>
            <span>{t('weekOf', { date: dateText(week.weekStart) })}</span>
            <b>{t('weekLine', { runs: week.runs, km: km(week.distanceM) })}</b>
          </li>
        })}
      </ol>
    </>}

    <h3 className="tg-run-h3">{t('history')}</h3>
    {shown.length === 0 ? <p className="tg-run-muted">{t('empty')}</p> : <ul className="tg-run-list">
      {shown.map(run => <li key={run.id}>
        <span><b>{dateText(run.run_date)}</b><small>{km(run.distance_m)} {t('unitKm')} · {t('pace', { pace: paceText(run.distance_m, run.duration_s) })}</small></span>
        <button aria-label={t('removeLabel', { date: dateText(run.run_date) })} className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => remove(run.id)} type="button"><Trash2 size={15} aria-hidden="true" />{t('remove')}</button>
      </li>)}
    </ul>}
    {(page > 1 || hasNext) && <nav className="tg-run-pages">
      {page > 1 && <Link href={pageHref(page - 1)} scroll={false}>{t('newer')}</Link>}
      {hasNext && <Link href={pageHref(page + 1)} scroll={false}>{t('older')}</Link>}
    </nav>}
    <p className="tg-self-note">{t('selfNote')} · {t('guardianNote')}</p>
  </section>
}
