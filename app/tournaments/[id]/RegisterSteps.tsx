import { useTranslations } from 'next-intl'

// The three steps of entering a team, shown at the top of the team and payment screens.
// Step 2 (inviting players) happens on /team-members, between the two.
const STEPS = ['team', 'invite', 'pay'] as const

export type TournamentSummaryProps = { day: string; month: string; name: string; line: string }

export function RegisterSteps({ current }: { current: 1 | 3 }) {
  const t = useTranslations('tournament')
  return <ol className="tn-flow" aria-label={t('stepsLabel', { step: current })}>
    {STEPS.map((step, index) => <li aria-current={index + 1 === current ? 'step' : undefined} className={index + 1 < current ? 'is-done' : index + 1 === current ? 'is-now' : ''} key={step}>
      <i /><span>{t(`steps.${step}`)}</span>
    </li>)}
  </ol>
}

// Which tournament this entry is for, so nobody pays the wrong one.
export function TournamentSummary({ day, month, name, line }: TournamentSummaryProps) {
  return <div className="tn-summary">
    <span className="tn-date is-next" aria-hidden="true"><b>{day}</b><small>{month}</small></span>
    <div><b className="tn-summary-name">{name}</b><small>{line}</small></div>
  </div>
}
