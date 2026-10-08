import { bandForAge, canSelfStart, getProgram, programsForBand, type Program } from './content'
import type { Enrollment, MyTraining } from './data'
import { trainingProgress, type Progress } from './schedule'

/** The programme to suggest first: the athlete's own age band, one they may start alone. */
export function recommendedProgram(age: number | null | undefined): Program | null {
  const band = bandForAge(age)
  if (!band) return null
  return programsForBand(band).find(program => canSelfStart(program, age)) ?? null
}

export type TrainingHome =
  | { state: 'hidden' }
  | { state: 'pick'; recommended: Program | null }
  | { state: 'enrolled'; enrollment: Enrollment; program: Program; progress: Progress; needsAction: boolean }

/**
 * What the training card on "ของฉัน" shows, and whether it carries the page's primary button:
 * choosing a programme, or today's session when one is planned and not done yet. On a rest day
 * or once today is done the card is information only and another step may take the primary.
 */
export function trainingHome(training: MyTraining, today: string, age: number | null | undefined): TrainingHome {
  if (!training.available) return { state: 'hidden' }
  const enrollment = training.enrollments.find(item => getProgram(item.program_id))
  const program = enrollment ? getProgram(enrollment.program_id) : null
  if (!enrollment || !program) return { state: 'pick', recommended: recommendedProgram(age) }
  const progress = trainingProgress({ start: enrollment.start_date, weekdays: enrollment.weekdays, weeks: program.weeks, checkins: training.checkins[enrollment.id] ?? [], today })
  return { state: 'enrolled', enrollment, program, progress, needsAction: Boolean(progress.today && !progress.doneToday) }
}

export const trainingHasPrimary = (home: TrainingHome) => home.state === 'pick' || (home.state === 'enrolled' && home.needsAction)
