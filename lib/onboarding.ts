// What /welcome asks and saves (UX report 8, mockups 1-2): two screens, who you are and which
// sport. Who you are decides where you go, so the old "what do you want to start with" screen
// is gone, but the answers saved to `profiles` are the ones the database already accepts
// (profiles_onboarding_persona_check and profiles_onboarding_goal_check, sql/27): no SQL change.

/** What the person taps. Coach and organizer are two choices so each reads as itself. */
export type Choice = 'athlete' | 'guardian' | 'coach' | 'organizer' | 'venue_owner' | 'sponsor_brand'
/** What `profiles.onboarding_persona` stores. */
export type Persona = 'athlete' | 'guardian' | 'coach_organizer' | 'venue_owner' | 'sponsor_brand'
/** What `profiles.onboarding_goal` stores. */
export type Goal = 'player_card' | 'find_competitions' | 'follow_athlete' | 'manage_venue' | 'support_athletes'

export const CHOICES: readonly Choice[] = ['athlete', 'guardian', 'coach', 'organizer', 'venue_owner', 'sponsor_brand']

// One persona column serves both: the coach can create teams from it, and only a role an
// administrator grants (profiles.role) makes someone an organizer (lib/role-home.ts).
export const personaOf = (choice: Choice): Persona => (choice === 'coach' || choice === 'organizer' ? 'coach_organizer' : choice)

// The first, recommended goal of each role: the one the first screen used to pre-select.
const GOALS: Record<Persona, Goal> = {
  athlete: 'player_card',
  guardian: 'follow_athlete',
  coach_organizer: 'find_competitions',
  venue_owner: 'manage_venue',
  sponsor_brand: 'support_athletes',
}
export const goalFor = (choice: Choice): Goal => GOALS[personaOf(choice)]

const DESTINATIONS: Record<Choice, string> = {
  athlete: '/card',
  guardian: '/guardian',
  coach: '/tournaments',
  // "My page" shows an organizer their tournaments, or says plainly that the permission is not granted yet.
  organizer: '/profile',
  venue_owner: '/venue',
  sponsor_brand: '/sponsor',
}
export const destinationFor = (choice: Choice): string => DESTINATIONS[choice]

export function savedAnswers(choice: Choice | null, sport: string, skipped: boolean) {
  if (skipped || !choice) return { onboarding_persona: null, onboarding_sport: null, onboarding_goal: null }
  return { onboarding_persona: personaOf(choice), onboarding_sport: sport, onboarding_goal: goalFor(choice) }
}
