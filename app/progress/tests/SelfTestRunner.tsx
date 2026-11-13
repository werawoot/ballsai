'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase'
import { parseSelfTestValue, type SelfTestSpec, type SelfTestSummary } from '@/lib/training/self-tests'

// The pain question first, as before a session (SQL63 rule): its answer is never sent anywhere,
// and on "pain" no test opens. Then one card per test: how to do it, the last result against the
// one before, and a number to enter through record_my_self_test (SQL96), which keeps one result
// per test per day, so entering again the same day corrects it.

export type SelfTestCard = { spec: SelfTestSpec; open: boolean } & SelfTestSummary
type Stage = 'gate' | 'pain' | 'run'
type SaveState = 'idle' | 'saving' | 'saved' | 'failed' | 'invalid'

export default function SelfTestRunner({ cards, locale }: { cards: SelfTestCard[]; locale: string }) {
  const t = useTranslations('selfTests')
  const [stage, setStage] = useState<Stage>('gate')
  // Focus follows the stage, so a keyboard or screen-reader user is not left on a removed button.
  // It lands on the heading, never on an answer: the pain question must not steer anyone.
  const heading = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)
  useEffect(() => { if (moved.current) heading.current?.focus(); moved.current = true }, [stage])
  const date = new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const day = (value: string) => date.format(new Date(`${value}T00:00:00Z`))

  if (stage === 'gate') return <section className="pf-card" aria-labelledby="st-gate">
    <h2 id="st-gate" className="pf-card-title" ref={heading} tabIndex={-1}>{t('gateTitle')}</h2>
    <p className="pf-card-desc">{t('gateText')}</p>
    <div className="st-gate">
      <button type="button" className="pf-btn pf-btn-ghost" onClick={() => setStage('run')}>{t('noPain')}</button>
      <button type="button" className="pf-btn pf-btn-ghost" onClick={() => setStage('pain')}>{t('pain')}</button>
    </div>
    <p className="pf-note">{t('stopRule')}</p>
  </section>

  if (stage === 'pain') return <section className="pf-card" role="status">
    <h2 className="pf-card-title" ref={heading} tabIndex={-1}>{t('painTitle')}</h2>
    <p className="pf-card-desc">{t('painText')}</p>
    <Link href="/progress" className="pf-btn pf-btn-ghost">{t('painBack')}</Link>
  </section>

  return <>
    <h2 className="sr-only" ref={heading} tabIndex={-1}>{t('title')}</h2>
    {cards.map(card => <TestCard key={card.spec.key} card={card} day={day} />)}
  </>
}

// Exported for its rendering test (the page reaches it only past the pain question).
export function TestCard({ card, day }: { card: SelfTestCard; day: (value: string) => string }) {
  const t = useTranslations('selfTests')
  const router = useRouter()
  const { spec } = card
  const [value, setValue] = useState(card.testedToday && card.latest ? String(card.latest.value) : '')
  const [state, setState] = useState<SaveState>('idle')
  const unit = t(`units.${spec.unit}`)
  const id = `st-${spec.key}`

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const number = parseSelfTestValue(spec.key, value)
    if (number === null) { setState('invalid'); return }
    setState('saving')
    const { error } = await createClient().rpc('record_my_self_test', { p_test: spec.key, p_value: number })
    if (error) { setState('failed'); return }
    setState('saved')
    router.refresh()
  }

  async function remove() {
    if (!card.latest || !window.confirm(t('removeConfirm'))) return
    setState('saving')
    const { error } = await createClient().rpc('delete_my_self_test', { p_test: spec.key, p_date: card.latest.test_date })
    if (error) { setState('failed'); return }
    setValue('')
    setState('idle')
    router.refresh()
  }

  const message: Record<SaveState, string> = {
    idle: '', saving: t('saving'), saved: t('saved'), failed: t('failed'), invalid: t('invalid', { min: spec.min, max: spec.max }),
  }
  const change = card.change
  const changeText = change === null ? null
    : change > 0 ? t('better', { amount: `${change} ${unit}` })
      : change < 0 ? t('lower', { amount: `${-change} ${unit}` })
        : t('same')

  return <section className="pf-card st-card" aria-labelledby={`${id}-title`}>
    <div className="pf-lv-row">
      <h2 id={`${id}-title`} className="pf-card-title">{t(`tests.${spec.key}.name`)}</h2>
      <span className="pf-chip">{t(`tests.${spec.key}.goal`)}</span>
    </div>
    <ol className="st-how">
      <li>{t(`tests.${spec.key}.how1`)}</li>
      <li>{t(`tests.${spec.key}.how2`)}</li>
      <li>{t(`tests.${spec.key}.how3`)}</li>
    </ol>
    <p className="pf-note">{t('stopRule')}</p>

    <div className="st-result">
      {card.latest
        ? <p><b>{t('latest', { value: `${card.latest.value} ${unit}`, date: day(card.latest.test_date) })}</b> <span className="pf-chip">{t('self')}</span></p>
        : <p>{t('none')}</p>}
      {changeText && <p>{changeText}</p>}
      {card.latest && <p className="pf-note">{card.due ? t('dueNow') : t('nextDue', { date: day(card.nextDue) })}</p>}
      {card.latest && <p><Link href={`/progress/tests/history?test=${spec.key}`}>{t('history.open')}</Link></p>}
    </div>

    {!card.open
      ? <p className="pf-note" role="note">{t('ageClosed', { age: spec.minAge ?? 0 })}</p>
      : <form className="st-form" onSubmit={save} noValidate>
        <label htmlFor={`${id}-value`} className="pf-field">
          <span>{t('inputLabel', { unit })}</span>
          <input id={`${id}-value`} className="pf-input" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={value}
            aria-invalid={state === 'invalid'} aria-describedby={`${id}-msg`}
            onChange={event => { setValue(event.target.value); setState('idle') }} />
        </label>
        <button type="submit" className="pf-btn pf-btn-primary" disabled={state === 'saving'}>{card.testedToday ? t('saveAgain') : t('save')}</button>
        {card.testedToday && <button type="button" className="pf-btn pf-btn-ghost" onClick={remove} disabled={state === 'saving'}>{t('remove')}</button>}
        <p id={`${id}-msg`} className="pf-note" role="status">{message[state]}</p>
      </form>}
  </section>
}
