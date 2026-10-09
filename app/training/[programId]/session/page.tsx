import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import PageHeader from '@/components/PageHeader'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { bangkokToday } from '@/lib/public-tournaments'
import { drillImage, getProgram, say, sessionDrills } from '@/lib/training/content'
import { fetchMyTraining } from '@/lib/training/data'
import { trainingProgress } from '@/lib/training/schedule'
import { tournamentDateRange } from '@/lib/tournament-dates'
import SessionRunner from './SessionRunner'
import '../../training.css'

// Today's session: heat advice, the pain gate, the checklist, "Done". Everything the
// runner needs is worked out here, so the client only ticks and saves.
export default async function SessionPage(props: { params: Promise<{ programId: string }> }) {
  const { programId } = await props.params
  const program = getProgram(programId)
  if (!program) notFound()
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/training/${program.id}/session`)}`)
  const [t, locale, mine] = await Promise.all([getTranslations('training'), getLocale(), fetchMyTraining(supabase, user.id)])
  const enrollment = mine.enrollments.find(item => item.program_id === program.id)
  if (!enrollment) redirect(`/training/${program.id}`)
  const today = bangkokToday()
  const checkins = mine.checkins[enrollment.id] ?? []
  const progress = trainingProgress({ start: enrollment.start_date, weekdays: enrollment.weekdays, weeks: program.weeks, checkins, today })
  // What "Done" will show: the same numbers once today's check-in is in.
  const after = trainingProgress({ start: enrollment.start_date, weekdays: enrollment.weekdays, weeks: program.weeks, checkins: [...checkins, today], today })

  return (
    <main className="bds-page tr ui-matchday">
      <PageHeader back={{ href: `/training/${program.id}`, label: say(program.title, locale) }} />
      <div className="tr-wrap tr-session">
        <SessionRunner
          after={{ done: after.done, total: after.total, streak: after.streakWeeks, next: after.next ? tournamentDateRange(locale, after.next) : null }}
          alreadyDone={progress.doneToday}
          drills={sessionDrills(program).map(drill => ({ id: drill.id, image: drillImage(drill.id), name: say(drill.name, locale), dose: say(drill.dose, locale), seconds: drill.seconds }))}
          enrollmentId={enrollment.id}
          heading={{ code: program.code, title: say(program.title, locale), week: t('session.weekOf', { week: progress.week, done: Math.min(progress.done + 1, progress.total), total: progress.total }) }}
          plannedToday={progress.today === today}
          programId={program.id}
          today={today}
          userId={user.id}
        />
      </div>
    </main>
  )
}
