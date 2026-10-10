'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowDown, ArrowUp, BookOpen, Minus, Plus, Save, Search, X } from 'lucide-react'
import { DAY_LIMITS, addDays, cleanPlanDays, planSummary, type LibraryDrill, type Load, type PlanBlock, type PlanDay, type Weekday } from '@/lib/team-training'
import { useApiErrorText } from '@/lib/use-api-error-text'

type Week = { weekStart: string; days: PlanDay[] }
const LOADS: Load[] = [1, 2, 3]
const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]
const dayMonth = (iso: string) => { const [, month, day] = iso.split('-'); return `${Number(day)}/${Number(month)}` }
const dayTotal = (day: PlanDay | undefined) => (day?.blocks ?? []).reduce((sum, item) => sum + item.minutes, 0)

// The coach's weekly team plan (sql/72): pick a week and a day, add drills from the
// reviewed library or name your own, set minutes and load, save, and optionally notify the
// team. A day with no drills is a rest day. The same checks as the database run before
// saving (lib/team-training), so a refusal is explained here, not after the round trip.
export default function TeamTrainingPanel({ teamId, weeks, today, library, ready }: { teamId: string; weeks: Week[]; today: Weekday; library: LibraryDrill[]; ready: boolean }) {
  const t = useTranslations('teamTraining')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [weekIndex, setWeekIndex] = useState(0)
  const [plans, setPlans] = useState<PlanDay[][]>(() => weeks.map(week => week.days))
  const [dirty, setDirty] = useState<boolean[]>(() => weeks.map(() => false))
  const [day, setDay] = useState<Weekday>(today)
  const [picker, setPicker] = useState(false)
  const [query, setQuery] = useState('')
  const [own, setOwn] = useState('')
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const found = library.filter(drill => !needle || drill.name.toLowerCase().includes(needle) || drill.group.toLowerCase().includes(needle))
    return [...new Set(found.map(drill => drill.group))].map(group => ({ group, drills: found.filter(drill => drill.group === group) }))
  }, [library, query])

  if (!ready) return <p className="tp-empty">{t('notReady')}</p>

  const week = weeks[weekIndex]
  const plan = plans[weekIndex]
  const current = plan.find(item => item.day === day)
  const summary = planSummary(plan.filter(item => item.blocks.length))
  const full = Boolean(current) && (current!.blocks.length >= DAY_LIMITS.blocks || dayTotal(current) >= DAY_LIMITS.dayMinutes)
  const groupOf = new Map(library.map(drill => [drill.id, drill.group]))

  const change = (update: (days: PlanDay[]) => PlanDay[]) => {
    setPlans(all => all.map((days, index) => (index === weekIndex ? update(days) : days)))
    setDirty(all => all.map((value, index) => (index === weekIndex ? true : value)))
    setMessage(null)
  }
  const changeDay = (update: (target: PlanDay) => PlanDay) => change(days => {
    const target = days.find(item => item.day === day) ?? { day, title: '', blocks: [] }
    return [...days.filter(item => item.day !== day), update(target)].sort((a, b) => a.day - b.day)
  })
  const changeBlock = (index: number, update: (block: PlanBlock) => PlanBlock) =>
    changeDay(target => ({ ...target, blocks: target.blocks.map((block, at) => (at === index ? update(block) : block)) }))
  const addBlock = (block: PlanBlock) => {
    if (full) { setMessage({ tone: 'error', text: t('dayFull') }); return }
    changeDay(target => ({ ...target, blocks: [...target.blocks, block] }))
  }
  const move = (index: number, step: number) => changeDay(target => {
    const blocks = [...target.blocks]
    const [item] = blocks.splice(index, 1)
    blocks.splice(index + step, 0, item)
    return { ...target, blocks }
  })
  const stepMinutes = (minutes: number, step: number) => Math.min(DAY_LIMITS.minutes, Math.max(1, step > 0 ? Math.floor(minutes / 5) * 5 + 5 : Math.ceil(minutes / 5) * 5 - 5))

  const save = async () => {
    if (busy) return
    const days = cleanPlanDays(plan.filter(item => item.blocks.length))
    if (!days) { setMessage({ tone: 'error', text: t('dayFull') }); return }
    setBusy(true); setMessage(null)
    const response = await fetch('/api/team-training', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', data: { teamId, weekStart: week.weekStart, days, notify } }),
    }).catch(() => null)
    const body = response ? await response.json().catch(() => null) : null
    setBusy(false)
    if (!response?.ok) { setMessage({ tone: 'error', text: errorText(body, t('saveFailed')) }); return }
    const notified = Number(body?.data ?? 0)
    setDirty(all => all.map((value, index) => (index === weekIndex ? false : value)))
    setMessage({ tone: 'ok', text: notified > 0 ? t('savedNotified', { count: notified }) : notified < 0 ? t('savedQuiet') : t('saved') })
    router.refresh()
  }

  const weekLabel = (index: number) => (index === 0 ? t('thisWeek') : t('nextWeek'))
  const range = t('weekRange', { from: dayMonth(week.weekStart), to: dayMonth(addDays(week.weekStart, 6)) })

  return (
    <div className="te">
      <div className="tp-chips" role="group" aria-label={t('title')}>
        {weeks.map((item, index) => <button type="button" key={item.weekStart} className={index === weekIndex ? 'is-on' : undefined} aria-pressed={index === weekIndex}
          onClick={() => { setWeekIndex(index); setDay(index === 0 ? today : 0); setPicker(false); setMessage(null) }}>{weekLabel(index)}</button>)}
      </div>
      <p className="tp-note">{range}</p>

      <div className="tt-days" role="group" aria-label={weekLabel(weekIndex)}>
        {WEEKDAYS.map(index => {
          const has = plan.some(item => item.day === index && item.blocks.length)
          return <button type="button" key={index} className={[index === day ? 'is-on' : '', has ? 'has-plan' : ''].join(' ').trim() || undefined}
            aria-pressed={index === day} aria-label={t(`dayNames.${index}`)} onClick={() => { setDay(index); setPicker(false) }}>
            {t(`days.${index}`)}<i aria-hidden="true" />
          </button>
        })}
      </div>

      <div className="ui-card te-form">
        <div className="te-top"><b className="te-title">{t(`dayNames.${day}`)}</b>{current?.blocks.length ? <span className="tn-length">{t('dayTotal', { minutes: dayTotal(current) })}</span> : null}</div>
        {current
          ? <label>{t('dayTitle')}<input value={current.title} maxLength={DAY_LIMITS.title} placeholder={t('titlePlaceholder')} onChange={event => changeDay(target => ({ ...target, title: event.target.value }))} /></label>
          : <p className="tp-empty">{t('rest')} · {t('restNote')}</p>}

        {current?.blocks.map((block, index) => <div className="tt-block" key={`${index}-${block.name}`}>
          <div className="tt-block-head">
            <span><b>{block.name}</b><small>{block.drill ? t('fromLibrary', { group: groupOf.get(block.drill) ?? '' }) : t('mine')}</small></span>
            <button type="button" aria-label={t('up', { name: block.name })} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} aria-hidden="true" /></button>
            <button type="button" aria-label={t('down', { name: block.name })} disabled={index === current.blocks.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} aria-hidden="true" /></button>
            <button type="button" aria-label={t('remove', { name: block.name })} onClick={() => changeDay(target => ({ ...target, blocks: target.blocks.filter((_, at) => at !== index) }))}><X size={15} aria-hidden="true" /></button>
          </div>
          <div className="tt-block-controls">
            <button type="button" aria-label={t('less', { name: block.name })} onClick={() => changeBlock(index, item => ({ ...item, minutes: stepMinutes(item.minutes, -1) }))}><Minus size={15} aria-hidden="true" /></button>
            <b>{t('minutes', { count: block.minutes })}</b>
            <button type="button" aria-label={t('more', { name: block.name })} onClick={() => changeBlock(index, item => ({ ...item, minutes: stepMinutes(item.minutes, 1) }))}><Plus size={15} aria-hidden="true" /></button>
            <span className="tt-loads" role="group" aria-label={`${t('load')}: ${block.name}`}>
              {LOADS.map(load => <button type="button" key={load} className={block.load === load ? `is-on is-load-${load}` : undefined} aria-pressed={block.load === load}
                onClick={() => changeBlock(index, item => ({ ...item, load }))}>{t(`loads.${load}`)}</button>)}
            </span>
          </div>
        </div>)}

        {current
          ? <>
              <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setPicker(open => !open)}><BookOpen size={16} aria-hidden="true" />{t('addDrill')}</button>
              <div className="tt-own">
                <input value={own} maxLength={DAY_LIMITS.name} placeholder={t('ownPlaceholder')} aria-label={t('ownDrill')} onChange={event => setOwn(event.target.value)} />
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={!own.trim()} onClick={() => { addBlock({ drill: null, name: own.trim(), minutes: 15, load: 2 }); setOwn('') }}>{t('addOwn')}</button>
              </div>
            </>
          : <button type="button" className="ui-btn ui-btn-ghost" onClick={() => { changeDay(target => target); setPicker(true) }}>{t('addDay')}</button>}

        {picker && current && <div className="tt-library">
          <div className="te-top"><b>{t('libraryTitle')}</b><button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setPicker(false)}>{t('close')}</button></div>
          <label className="tt-search"><Search size={15} aria-hidden="true" /><input value={query} placeholder={t('search')} aria-label={t('search')} onChange={event => setQuery(event.target.value)} /></label>
          <p className="tp-note">{t('libraryNote')}</p>
          {groups.length ? groups.map(entry => <div key={entry.group}>
            <h4>{entry.group}</h4>
            {entry.drills.map(drill => <div className="tt-pick" key={drill.id}>
              <button type="button" onClick={() => addBlock({ drill: drill.id, name: drill.name, minutes: drill.minutes, load: 2 })}><Plus size={15} aria-hidden="true" /><span>{drill.name}</span><small>{t('minutes', { count: drill.minutes })}</small></button>
              <Link href={`/training/drills/${drill.id}`} target="_blank">{t('howTo')}</Link>
            </div>)}
          </div>) : <p className="tp-empty">{t('noMatch')}</p>}
        </div>}
      </div>

      <p className="te-counts">{t('summary', { days: summary.days, minutes: summary.minutes })}{summary.load ? ` · ${t('summaryLoad', { load: t(`loads.${summary.load}`) })}` : ''}</p>
      {dirty[weekIndex] && <p className="tp-note">{t('unsaved')}</p>}
      <label className="tt-notify"><input type="checkbox" checked={notify} onChange={event => setNotify(event.target.checked)} />{t('notify')}</label>
      {message && <p className={message.tone === 'ok' ? 'tp-ok' : 'tp-alert'} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
      <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={save}><Save size={16} aria-hidden="true" />{busy ? t('saving') : `${t('save')} · ${weekLabel(weekIndex)}`}</button>
    </div>
  )
}
