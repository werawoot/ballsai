// A parent cannot link a child who has no account yet (request_guardian_link, sql/21), so a
// parent who is about to follow an athlete is told the order of the three steps: /guardian
// shows them above the form, and /welcome shows them where a guardian picks "follow an athlete".
export const guardianStepsApply = (persona: string | null, goal: string | null) => persona === 'guardian' && goal === 'follow_athlete'

// A parent already has a child linked, or a request waiting for the child, once any link is
// accepted or pending: then the steps are no longer news.
export const needsGuardianSteps = (links: { status: string }[]) => !links.some(link => link.status === 'accepted' || link.status === 'pending')
