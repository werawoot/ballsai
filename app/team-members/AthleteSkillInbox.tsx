'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { COACH_SKILL_KEYS, type CoachSkills } from '@/lib/coach-skills'
import { useApiErrorText } from '@/lib/use-api-error-text'

export type SkillProposal = { id: string; teamName: string; skills: CoachSkills; createdAt: string }

// The athlete's side of a coach skill rating (sql/69). Only the athlete answers; on
// accept the five numbers appear on their card labelled as the coach's assessment.
export default function AthleteSkillInbox({ proposals }: { proposals: SkillProposal[] }) {
  const t = useTranslations('coachSkills')
  const tp = useTranslations('player')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  if (!proposals.length) return null

  const respond = async (id: string, status: 'accepted' | 'declined') => {
    if (busy) return
    setBusy(`${status}:${id}`); setMessage(null)
    const response = await fetch('/api/coach-skill-assessments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'respond', id, data: { status } }),
    }).catch(() => null)
    const body = response ? await response.json().catch(() => null) : null
    setBusy(null)
    if (!response?.ok) { setMessage({ tone: 'error', text: errorText(body, t('answerFailed')) }); return }
    setMessage({ tone: 'ok', text: status === 'accepted' ? t('accepted') : t('declined') })
    router.refresh()
  }

  return (
    <section className="ui-card" style={{ display: 'grid', gap: 10, marginBottom: 20, padding: 14 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ui-text)' }}>{t('inboxTitle')}</h2>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ui-mute)', lineHeight: 1.6 }}>{t('inboxRule')}</p>
      {message && <p role={message.tone === 'ok' ? 'status' : 'alert'} style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: message.tone === 'ok' ? 'var(--ui-ok)' : '#ff8a8a' }}>{message.text}</p>}
      {proposals.map(item => <article key={item.id} style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--ui-line)', paddingTop: 10 }}>
        <b style={{ fontSize: 14.5, color: 'var(--ui-text)' }}>{t('fromTeam', { team: item.teamName })}</b>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6, margin: 0 }}>
          {COACH_SKILL_KEYS.map(key => <div key={key} style={{ textAlign: 'center', background: 'var(--ui-sunk)', borderRadius: 10, padding: '7px 2px' }}>
            <dt style={{ fontSize: 11, color: 'var(--ui-mute)', fontWeight: 700 }}>{tp(`skillNames.${key}`)}</dt>
            <dd style={{ margin: '2px 0 0', fontSize: 17, fontWeight: 800, color: 'var(--ui-text)' }}>{item.skills[key] ?? '—'}</dd>
          </div>)}
        </dl>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={Boolean(busy)} onClick={() => respond(item.id, 'accepted')}>{busy === `accepted:${item.id}` ? t('sending') : t('accept')}</button>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={Boolean(busy)} onClick={() => respond(item.id, 'declined')}>{busy === `declined:${item.id}` ? t('sending') : t('decline')}</button>
        </div>
      </article>)}
    </section>
  )
}
