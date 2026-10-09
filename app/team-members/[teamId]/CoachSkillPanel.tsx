'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Minus, Plus, Send } from 'lucide-react'
import { COACH_SKILL_KEYS, stepSkill, type CoachSkills, type ProposalStatus } from '@/lib/coach-skills'
import { useApiErrorText } from '@/lib/use-api-error-text'

type Member = { athleteId: string; name: string }
export type LatestProposal = { status: ProposalStatus; skills: CoachSkills; createdAt: string }

const empty = (): CoachSkills => ({ speed: null, stamina: null, strength: null, technique: null, vision: null })

// The coach's side of a skill rating (sql/69): pick a member, set the five skills with
// − and +, send. Nothing shows on the athlete's card until the athlete accepts.
export default function CoachSkillPanel({ teamId, members, latest, ready }: { teamId: string; members: Member[]; latest: Record<string, LatestProposal>; ready: boolean }) {
  const t = useTranslations('coachSkills')
  const tp = useTranslations('player')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [who, setWho] = useState(members[0]?.athleteId ?? '')
  const [drafts, setDrafts] = useState<Record<string, CoachSkills>>({})
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  if (!members.length) return null
  if (!ready) return <p className="tp-empty">{t('notReady')}</p>

  const proposal = latest[who]
  const skills = drafts[who] ?? proposal?.skills ?? empty()
  const anySet = COACH_SKILL_KEYS.some(key => skills[key] !== null)
  const change = (key: (typeof COACH_SKILL_KEYS)[number], step: number) => {
    setDrafts(current => ({ ...current, [who]: { ...skills, [key]: stepSkill(skills[key], step) } }))
    setMessage(null)
  }
  const send = async () => {
    if (sending || !anySet) return
    setSending(true); setMessage(null)
    const response = await fetch('/api/coach-skill-assessments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit', id: teamId, data: { athleteId: who, skills } }),
    }).catch(() => null)
    const body = response ? await response.json().catch(() => null) : null
    setSending(false)
    if (!response?.ok) { setMessage({ tone: 'error', text: errorText(body, t('sendFailed')) }); return }
    setMessage({ tone: 'ok', text: t('sent') })
    setDrafts(current => { const next = { ...current }; delete next[who]; return next })
    router.refresh()
  }

  return (
    <div className="ui-card tp-skills">
      <div className="tp-chips" role="group" aria-label={t('pickAthlete')}>
        {members.map(member => <button type="button" key={member.athleteId} className={member.athleteId === who ? 'is-on' : undefined} aria-pressed={member.athleteId === who} onClick={() => { setWho(member.athleteId); setMessage(null) }}>{member.name}</button>)}
      </div>
      {proposal && <p className={`tp-status is-${proposal.status}`}>{t(`status.${proposal.status}`)}</p>}
      {COACH_SKILL_KEYS.map(key => <div className="tp-skill" key={key}>
        <span>{tp(`skillNames.${key}`)}</span>
        <span className="tp-track" aria-hidden="true"><i style={{ width: `${skills[key] ?? 0}%` }} /></span>
        <button type="button" aria-label={t('lower', { skill: tp(`skillNames.${key}`) })} onClick={() => change(key, -5)} disabled={skills[key] === null}><Minus size={16} aria-hidden="true" /></button>
        <button type="button" aria-label={t('raise', { skill: tp(`skillNames.${key}`) })} onClick={() => change(key, 5)} disabled={skills[key] === 99}><Plus size={16} aria-hidden="true" /></button>
        <b>{skills[key] ?? '—'}</b>
      </div>)}
      <p className="tp-note">{t('rule')}</p>
      {message && <p className={message.tone === 'ok' ? 'tp-ok' : 'tp-alert'} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
      <button type="button" className="ui-btn ui-btn-primary" disabled={!anySet || sending} onClick={send}><Send size={16} aria-hidden="true" />{sending ? t('sending') : t('send')}</button>
    </div>
  )
}
