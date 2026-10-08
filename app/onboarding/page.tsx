import { permanentRedirect } from 'next/navigation'

// People guess /onboarding for the first-run screens, which live at /welcome.
export default function OnboardingAlias() {
  permanentRedirect('/welcome')
}
