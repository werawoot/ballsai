'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Bed } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { MIN_REST_DAYS, checkWeekdays, sessionDates } from '@/lib/training/schedule'
import { tournamentDateRange } from '@/lib/tournament-dates'
import type { Band } from '@/lib/training/content'

// Pick the weekdays. The rest days are kept by the rules in lib/training/schedule.ts and
// again by the database; a second press while saving does nothing.
export default function ScheduleForm({ programId, band, perWeek, weeks, minutes, today, userId }: { programId: string; band: Band; perWeek: number; weeks: number; minutes: number; today: string; userId: string }) {
  const t = useTranslations('training')
  const locale = useLocale()
  const router = useRouter()
  const [days, setDays] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const WEEK = [0, 1, 2, 3, 4, 5, 6] as const
  const check = checkWeekdays(days, { band, perWeek })
  const plan = useMemo(() => (check.ok ? sessionDates(today, days, weeks) : []), [check.ok, today, days, weeks])

  const toggle = (day: number) => setDays(current => current.includes(day) ? current.filter(item => item !== day) : current.length >= perWeek ? current : [...current, day].sort((a, b) => a - b))

  const save = async () => {
    if (!check.ok || saving) return
    setSaving(true)
    setError('')
    const { error: insertError } = await createClient().from('training_enrollments')
      .insert({ athlete_id: userId, program_id: programId, weekdays: days, start_date: today })
    if (insertError) {
      const message = insertError.message ?? ''
      setError(message.includes('TRAINING_ACTIVE_LIMIT') ? t('schedule.limit') : insertError.code === '23505' ? t('schedule.already') : t('schedule.failed'))
      setSaving(false)
      if (insertError.code !== '23505') return
    }
    router.replace(`/training/${programId}/session`)
    router.refresh()
  }

  return <>
    <h1 className="ui-h1" style={{ marginTop: 6 }}>{t('schedule.title')}</h1>
    <p className="tr-intro">{t('schedule.intro', { count: perWeek })}</p>
    <div className="tr-days" role="group" aria-label={t('schedule.title')}>
      {WEEK.map(day => <button aria-label={t(`schedule.daysLong.d${day}`)} aria-pressed={days.includes(day)} key={day} onClick={() => toggle(day)} type="button">{t(`schedule.days.d${day}`)}</button>)}
    </div>
    <p className="tr-rule"><Bed size={16} aria-hidden="true" /><span>{t('schedule.rest', { count: MIN_REST_DAYS[band] })}</span></p>
    {check.ok && <dl className="ui-card tr-kv" style={{ marginTop: 12 }}>
      <dt>{t('schedule.first')}</dt><dd>{tournamentDateRange(locale, plan[0])}</dd>
      <dt>{t('schedule.last')}</dt><dd>{tournamentDateRange(locale, plan[plan.length - 1])}</dd>
      <dt>{t('schedule.total')}</dt><dd>{t('schedule.totalValue', { count: plan.length, minutes })}</dd>
    </dl>}
    {error && <p className="tr-error" role="alert">{error}</p>}
    <div className="tr-dock"><div className="tr-dock-inner">
      <button className="ui-btn ui-btn-primary" disabled={!check.ok || saving} onClick={save} type="button">
        {saving ? t('schedule.saving') : check.ok ? t('schedule.confirm') : t('schedule.pickMore', { count: perWeek - days.length })}
      </button>
    </div></div>
  </>
}
