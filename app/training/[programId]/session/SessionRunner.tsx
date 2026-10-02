'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, CheckCircle2, Hand, Sun } from 'lucide-react'
import { createClient } from '@/lib/supabase'

type Drill = { id: string; image: string; name: string; dose: string; seconds: number }

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

// The session flow. "Any pain right now?" is asked first and its answer is never sent
// anywhere: on "pain" the session simply does not start (docs/training-flow-v1.md, rule 2).
// "Done" writes one check-in; the database refuses a second one for the same day, so a
// retry or a double tap changes nothing.
export default function SessionRunner({ programId, enrollmentId, userId, today, drills, heading, plannedToday, alreadyDone, after }: {
  programId: string; enrollmentId: string; userId: string; today: string; drills: Drill[]
  heading: { code: string; title: string; week: string }; plannedToday: boolean; alreadyDone: boolean
  after: { done: number; total: number; streak: number; next: string | null }
}) {
  const t = useTranslations('training')
  const router = useRouter()
  const [stage, setStage] = useState<'gate' | 'pain' | 'run' | 'done'>(alreadyDone ? 'done' : 'gate')
  const [ticked, setTicked] = useState<string[]>([])
  const [timer, setTimer] = useState<{ id: string; left: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Set once "Done" saves here; the refreshed page then also reports today as done.
  const [finishedNow, setFinishedNow] = useState(false)
  const firstButton = useRef<HTMLButtonElement>(null)

  useEffect(() => { if (stage === 'gate') firstButton.current?.focus() }, [stage])
  useEffect(() => {
    if (!timer || timer.left <= 0) return
    const id = setTimeout(() => setTimer(current => current && { ...current, left: current.left - 1 }), 1000)
    return () => clearTimeout(id)
  }, [timer])

  const toggle = (id: string) => setTicked(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  const left = drills.length - ticked.length

  const finish = async () => {
    if (left > 0 || saving) return
    setSaving(true)
    setError('')
    const { error: insertError } = await createClient().from('training_checkins')
      .insert({ enrollment_id: enrollmentId, athlete_id: userId, session_date: today, drills_done: ticked.length })
    // 23505: already checked in today (another tab, a retry). The session is done either way.
    if (insertError && insertError.code !== '23505') { setError(t('session.failed')); setSaving(false); return }
    setFinishedNow(true)
    setStage('done')
    router.refresh()
  }

  if (stage === 'pain') return <div className="tr-center" role="status">
    <span className="tr-big is-rest"><Hand size={40} aria-hidden="true" /></span>
    <h1 className="ui-h1">{t('session.painTitle')}</h1>
    <p>{t('session.painText')}</p>
    <Link className="ui-btn ui-btn-ghost" href={`/training/${programId}`} style={{ marginTop: 12, maxWidth: 320 }}>{t('session.painBack')}</Link>
  </div>

  if (stage === 'done') return <div className="tr-center" role="status">
    <span className="tr-big"><CheckCircle2 size={44} aria-hidden="true" /></span>
    <h1 className="ui-h1">{alreadyDone && !finishedNow ? t('session.alreadyDone') : t('done.title')}</h1>
    <p>{t('done.text', { done: after.done, total: after.total })}{after.next ? ` · ${t('done.next', { date: after.next })}` : ''}</p>
    <div className="tr-stats"><div><b>{after.done}</b><small>{t('done.sessions')}</small></div><div><b>{after.streak}</b><small>{t('done.streak')}</small></div></div>
    <span className="ui-chip is-self" style={{ marginTop: 10 }}>{t('done.self')}</span>
    <p className="tr-self">{t('done.selfNote')}</p>
    <Link className="ui-btn ui-btn-ghost" href={`/training/${programId}`} style={{ marginTop: 10, maxWidth: 320 }}>{t('done.backToProgram')}</Link>
  </div>

  return <>
    <p className="ui-eyebrow" style={{ marginTop: 4 }}>{heading.week}</p>
    <h1 className="ui-h1" style={{ marginTop: 4 }}>{heading.title}</h1>
    <div className="tr-heat"><Sun size={18} aria-hidden="true" /><span><b>{t('session.heatTitle')}</b>{t('session.heatText')}</span></div>
    {!plannedToday && <p className="tr-note">{t('session.notToday')}</p>}
    <div className="tr-progress" role="progressbar" aria-valuemin={0} aria-valuemax={drills.length} aria-valuenow={ticked.length} aria-label={t('session.title')}><i style={{ width: `${(ticked.length / Math.max(1, drills.length)) * 100}%` }} /></div>
    <ol className="tr-checks">
      {drills.map(drill => {
        const done = ticked.includes(drill.id)
        const running = timer?.id === drill.id
        return <li className={`tr-check${done ? ' is-done' : ''}`} key={drill.id}>
          <Image alt="" height={56} src={drill.image} unoptimized width={74} />
          <div className="tr-check-text">
            <b>{drill.name}</b>
            <small>{drill.dose}<Link href={`/training/drills/${drill.id}`}>{t('session.source')}</Link></small>
            <button className="tr-timer" onClick={() => setTimer({ id: drill.id, left: drill.seconds })} type="button">
              {running && timer.left > 0 ? t('session.timerRunning', { time: clock(timer.left) }) : t('session.timer', { time: clock(drill.seconds) })}
            </button>
          </div>
          <button aria-label={t('session.tickLabel', { name: drill.name })} aria-pressed={done} className="tr-tick" onClick={() => toggle(drill.id)} type="button">{done && <Check size={22} strokeWidth={3} />}</button>
        </li>
      })}
    </ol>
    {error && <p className="tr-error" role="alert">{error}</p>}
    <div className="tr-dock"><div className="tr-dock-inner">
      <button className="ui-btn ui-btn-primary" disabled={stage !== 'run' || left > 0 || saving} onClick={finish} type="button">
        {saving ? t('session.saving') : left > 0 ? t('session.doneLeft', { count: left }) : t('session.done')}
      </button>
    </div></div>

    {stage === 'gate' && <div aria-labelledby="tr-gate-title" aria-modal="true" className="tr-gate" role="dialog">
      <div className="tr-gate-sheet">
        <h2 id="tr-gate-title">{t('session.gateTitle')}</h2>
        <p>{t('session.gateText')}</p>
        <div className="tr-gate-actions">
          <button className="ui-btn ui-btn-primary" onClick={() => setStage('run')} ref={firstButton} type="button">{t('session.noPain')}</button>
          <button className="ui-btn ui-btn-ghost" onClick={() => setStage('pain')} type="button">{t('session.pain')}</button>
        </div>
        <p>{t('painStop')}</p>
      </div>
    </div>}
  </>
}
