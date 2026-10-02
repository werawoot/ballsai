import data from '@/content/training/programs.json'

// The training programmes (docs/training-flow-v1.md). Content lives in
// content/training/programs.json: reviewed by pull request, never edited in the app.
// Every drill names its source, and every source carries its licence and how it was
// checked, so anyone can follow drill → study → licence.

export type Band = 'u10_u13' | 'u14_u17'
export type Access = 'solo' | 'partner' | 'coach_guided' | 'restricted'
export type Text = { th: string; en: string }
export type Source = {
  title: string; author: string; url: string; doi: string | null; license: string
  commercialUse: boolean; adaptationAllowed: boolean; attribution: string; sourceMediaLicense: string
  evidenceLevel: string; licenseVerifiedAt: string; licenseVerificationMethod: string
}
export type Drill = { id: string; access: Access; seconds: number; source: string; name: Text; how: Text; dose: Text }
export type Program = {
  id: string; band: Band; minAge?: number; code: string; title: Text; goal: Text; claim: Text
  weeks: number; perWeek: number; minutes: number; access: Access; cover: string; sources: string[]; drills: Drill[]
}

export const TRAINING_SOURCES = data.sources as Record<string, Source>
export const TRAINING_PROGRAMS = data.programs as Program[]
export const CONTENT_REVIEW = data.review as 'draft' | 'reviewed'

/** Every drill picture is our own 3D render (scripts/training-art), never a source's media. */
export const drillImage = (id: string) => `/training/drills/${id}.webp`

/** The age band a programme list opens on. Under 10 joins the younger band; 18+ the older. */
export function bandForAge(age: number | null | undefined): Band | null {
  if (typeof age !== 'number' || !Number.isFinite(age)) return null
  return age <= 13 ? 'u10_u13' : 'u14_u17'
}

export const getProgram = (id: string) => TRAINING_PROGRAMS.find(program => program.id === id) ?? null
export const programsForBand = (band: Band) => TRAINING_PROGRAMS.filter(program => program.band === band)

/** Who may start a programme by themselves: only solo programmes, and only from minAge. */
export function canSelfStart(program: Program, age: number | null | undefined) {
  if (program.access !== 'solo') return false
  if (program.minAge && (typeof age !== 'number' || age < program.minAge)) return false
  return true
}

/** The drills of a self-training session: solo only. Partner drills are offered as an extra;
 * coach-guided and restricted drills are never part of it. */
export const sessionDrills = (program: Program) => program.drills.filter(drill => drill.access === 'solo')
export const partnerDrills = (program: Program) => program.drills.filter(drill => drill.access === 'partner')
export const coachDrills = (program: Program) => program.drills.filter(drill => drill.access === 'coach_guided')

export function findDrill(id: string) {
  for (const program of TRAINING_PROGRAMS) {
    const drill = program.drills.find(item => item.id === id)
    if (drill) return { program, drill, source: TRAINING_SOURCES[drill.source] ?? null }
  }
  return null
}

/** The content in the reader's language. */
export const say = (text: Text, locale: string) => (locale === 'en' ? text.en : text.th)
