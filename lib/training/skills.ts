import { TRAINING_PROGRAMS, type Band, type Drill, type Program } from '@/lib/training/content'

// The skill each drill trains, for the skill row on /training (owner, 24 Oct 2026). Only the
// drills we really have; a skill with no drill in a band is not offered in that band. One
// skill per drill. Every drill of the two injury-prevention warm-ups (u10-foundation-01 and
// u14-prevention-01, a* and c*) is 'injury', so the warm-up stays together; the skill
// programmes' drills go by what each mainly asks of the player.
export const SKILLS = ['control', 'dribble', 'shoot', 'pass', 'movement', 'fitness', 'injury'] as const
export type Skill = typeof SKILLS[number]

export const DRILL_SKILL: Record<string, Skill> = {
  'a1-react-jog': 'injury',
  'a2-skater-hops': 'injury',
  'a3-single-leg-ball': 'injury',
  'a4-pushup-ball': 'injury',
  'a5-single-leg-hops': 'injury',
  'a6-spider-crawl': 'injury',
  'a7-falling': 'injury',
  'b1-sole-rolls': 'control',
  'b2-cone-gates': 'dribble',
  'b3-wall-pass': 'pass',
  'b4-fake-and-go': 'dribble',
  'b5-reaction-start': 'movement',
  'b6-zigzag': 'movement',
  'b7-low-hops': 'fitness',
  'b8-juggling': 'control',
  'b9-small-game': 'pass',
  'c1-jog': 'injury',
  'c2-hip-out-in': 'injury',
  'c3-forward-back': 'injury',
  'c4-plank': 'injury',
  'c5-side-plank': 'injury',
  'c6-single-leg-balance': 'injury',
  'c7-squat-heel': 'injury',
  'c8-vertical-jump': 'injury',
  'c9-runs': 'injury',
  'c10-bounding': 'injury',
  'c11-plant-cut': 'injury',
  'c12-lunge': 'injury',
  'c13-nordic': 'injury',
  'd1-half-turn': 'control',
  'd2-scan-pass': 'pass',
  'd3-1v1-gate': 'dribble',
  'd4-striking': 'shoot',
  'd5-acceleration': 'movement',
  'd6-shuttle': 'movement',
  'd7-bodyweight': 'fitness',
  'd8-varied-dribble': 'dribble',
  'd9-small-game': 'pass',
}

export type BandDrill = { program: Program; drill: Drill; skill: Skill }

/** The drills of a band's programmes, each once, optionally of one skill. */
export function drillsForBand(band: Band, skill?: Skill): BandDrill[] {
  const seen = new Set<string>()
  const out: BandDrill[] = []
  for (const program of TRAINING_PROGRAMS.filter(item => item.band === band)) {
    for (const drill of program.drills) {
      const drillSkill = DRILL_SKILL[drill.id]
      if (!drillSkill || seen.has(drill.id) || (skill && drillSkill !== skill)) continue
      seen.add(drill.id)
      out.push({ program, drill, skill: drillSkill })
    }
  }
  return out
}

/** The skills a band has at least one drill for, in SKILLS order. */
export function skillsForBand(band: Band): Skill[] {
  const present = new Set(drillsForBand(band).map(item => item.skill))
  return SKILLS.filter(skill => present.has(skill))
}

export const isSkill = (value: unknown): value is Skill => SKILLS.includes(value as Skill)
