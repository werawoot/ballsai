'use client'
import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

// A two-step button for an action that cannot be undone: the first tap asks the question
// in the page, the second does it. Replaces window.confirm, which some browsers, in-app
// browsers and test tools dismiss on their own (W1 finding F5) and which looks foreign on
// a phone. Stays a plain button until it is tapped.
export default function ConfirmButton({ label, question, icon, disabled, onConfirm, className = 'ui-btn ui-btn-ghost ui-btn-sm' }: {
  label: ReactNode; question: string; icon?: ReactNode; disabled?: boolean; onConfirm: () => void; className?: string
}) {
  const t = useTranslations('confirmAction')
  const [asking, setAsking] = useState(false)
  if (!asking) return <button type="button" className={className} disabled={disabled} onClick={() => setAsking(true)}>{icon}{label}</button>
  return (
    <span className="cf-ask" role="group" aria-label={question}>
      <span className="cf-question" role="status">{question}</span>
      <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={disabled} onClick={() => { setAsking(false); onConfirm() }}>{t('yes')}</button>
      <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setAsking(false)}>{t('no')}</button>
    </span>
  )
}
