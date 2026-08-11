import { redirect } from 'next/navigation'

// Hall of Fame is intentionally grouped under Ranking until historical
// season awards exist. This keeps the primary navigation focused.
export default function HallOfFamePage() {
  redirect('/ranking?view=trending')
}
