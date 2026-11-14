'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Activity, CalendarCheck, Target, Zap, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { goFresh } from '@/lib/fresh-navigation'
import { TRAINING_GOALS, type TrainingGoal } from '@/lib/training/goals'

// The goal step before choosing a programme (ADR-015, owner 8 Nov 2026). One tap saves it
// through set_my_training_goal (SQL95), which ends the old goal and starts the new one at once.

export const GOAL_RELOAD_AFTER_MS = 3000

const ICONS: Record<TrainingGoal, LucideIcon> = { ball_control: Target, strength: Activity, speed: Zap, consistency: CalendarCheck }

export default function GoalPicker({ current, returnTo }: { current: TrainingGoal | null; returnTo: string }) {
  const t = useTranslations('training.goals')
  const router = useRouter()
  const [saving, setSaving] = useState<TrainingGoal | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The goal just saved, until the page shows it. Next sometimes cancels the navigation that
  // brings the new page (1 in 4 runs of scripts/e2e/athlete-flow.mjs, docs/e2e.md, 14 Nov 2026);
  // the save itself has landed. If this picker is still on screen with the old goal after a few
  // seconds, the page is loaded again in full (owner, 14 Nov 2026). On success the page drops
  // the picker, which clears the timer.
  const [pending, setPending] = useState<TrainingGoal | null>(null)
  useEffect(() => {
    if (!pending || pending === current) return
    const timer = window.setTimeout(() => window.location.replace(new URL(returnTo, window.location.href).href), GOAL_RELOAD_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [pending, current, returnTo])

  async function choose(goal: TrainingGoal) {
    setSaving(goal)
    setError(null)
    const { error: rpcError } = await createClient().rpc('set_my_training_goal', { p_goal: goal })
    setSaving(null)
    if (rpcError) {
      setError((rpcError.message ?? '').includes('TRAINING_GOAL_NO_ATHLETE') ? t('needAthlete') : t('failed'))
      return
    }
    setPending(goal)
    goFresh(router, returnTo)
  }

  return <section className="tg-goal-pick" aria-labelledby="tg-goal-title" data-return={returnTo}>
    <h2 id="tg-goal-title" className="tg-h2">{t('title')}</h2>
    <p className="tg-goal-lead">{t('lead')}</p>
    <ul className="tg-goal-options">
      {TRAINING_GOALS.map(goal => {
        const Icon = ICONS[goal]
        return <li key={goal}>
          <button type="button" className={`tg-goal-option${current === goal ? ' is-on' : ''}`} aria-pressed={current === goal} disabled={saving !== null} onClick={() => choose(goal)}>
            <Icon size={22} aria-hidden="true" />
            <span><b>{t(`options.${goal}.label`)}</b><small>{t(`options.${goal}.hint`)}</small></span>
          </button>
        </li>
      })}
    </ul>
    {saving && <p className="tg-note" role="status">{t('saving')}</p>}
    {error && <p className="tg-note is-error" role="alert">{error}</p>}
  </section>
}
