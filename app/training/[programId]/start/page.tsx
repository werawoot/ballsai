import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import PageHeader from '@/components/PageHeader'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { fetchAthleteAge } from '@/lib/athlete-private'
import { bangkokToday } from '@/lib/public-tournaments'
import { canSelfStart, getProgram, say } from '@/lib/training/content'
import { fetchMyTraining } from '@/lib/training/data'
import ScheduleForm from './ScheduleForm'
import '../../training.css'

// Choosing weekdays for a programme. Only a signed-in athlete, only a programme they may
// start alone; the database checks the same (sql/63).
export default async function StartPage(props: { params: Promise<{ programId: string }> }) {
  const { programId } = await props.params
  const program = getProgram(programId)
  if (!program) notFound()
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/training/${program.id}/start`)}`)
  const [t, locale, age, mine] = await Promise.all([getTranslations('training'), getLocale(), fetchAthleteAge(supabase, user.id), fetchMyTraining(supabase, user.id)])
  if (!canSelfStart(program, age)) redirect(`/training/${program.id}`)
  if (mine.enrollments.some(item => item.program_id === program.id)) redirect(`/training/${program.id}/session`)

  return (
    <main className="bds-page tr ui-matchday">
      <PageHeader back={{ href: `/training/${program.id}`, label: say(program.title, locale) }} />
      <div className="tr-wrap tr-session">
        {!mine.available
          ? <p className="tr-note" role="status">{t('notReady')}</p>
          : <ScheduleForm band={program.band} minutes={program.minutes} perWeek={program.perWeek} programId={program.id} today={bangkokToday()} userId={user.id} weeks={program.weeks} />}
      </div>
    </main>
  )
}
