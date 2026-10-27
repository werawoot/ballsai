'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { THAI_PROVINCES, provinceName } from '@/lib/thai-provinces'
import { ORG_TYPES, organizerRequestIssue, type OrganizerRequestField } from '@/lib/organizer-access'
import type { Locale } from '@/i18n/config'

// The five fields of ADR-013. Phone and note are seen only by admins; the organization
// name and province are shown on the organizer's public tournaments.
export default function OrganizerRequestForm() {
  const t = useTranslations('organizerRequest.form')
  const apiErrors = useTranslations('apiErrors')
  const locale = useLocale() as Locale
  const router = useRouter()
  const [fields, setFields] = useState({ orgName: '', orgType: '', province: '', phone: '', note: '' })
  const [issue, setIssue] = useState<OrganizerRequestField | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const set = (key: keyof typeof fields) => (event: { target: { value: string } }) => setFields(current => ({ ...current, [key]: event.target.value }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const problem = organizerRequestIssue(fields)
    setIssue(problem)
    setError('')
    if (problem) return
    setSending(true)
    const response = await fetch('/api/organizer-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) })
    if (response.status === 401) { router.push('/login?next=/organizer-request'); return }
    const data = await response.json().catch(() => null) as { code?: string; error?: string } | null
    setSending(false)
    if (!response.ok) {
      setError(data?.code && apiErrors.has(data.code as never) ? apiErrors(data.code as never) : (data?.error ?? apiErrors('requestInvalid')))
      return
    }
    router.refresh()
  }

  const invalid = (key: OrganizerRequestField) => issue === key ? { 'aria-invalid': true, 'aria-describedby': `or-${key}-error` } : {}
  const hint = (key: OrganizerRequestField) => issue === key ? <p className="or-field-error" id={`or-${key}-error`}>{t(`issue.${key}`)}</p> : null

  return (
    <form className="or-card gl-card or-form" onSubmit={submit} noValidate>
      <h2>{t('title')}</h2>
      <p>{t('text')}</p>
      <label htmlFor="or-orgName">{t('orgName')}</label>
      <input id="or-orgName" value={fields.orgName} onChange={set('orgName')} maxLength={120} autoComplete="organization" placeholder={t('orgNamePlaceholder')} {...invalid('orgName')} />
      {hint('orgName')}
      <fieldset {...(issue === 'orgType' ? { 'aria-describedby': 'or-orgType-error' } : {})}>
        <legend>{t('orgType')}</legend>
        <div className="or-types">
          {ORG_TYPES.map(type => <label key={type} className={fields.orgType === type ? 'is-on' : undefined}>
            <input type="radio" name="orgType" value={type} checked={fields.orgType === type} onChange={set('orgType')} />{t(`types.${type}`)}
          </label>)}
        </div>
      </fieldset>
      {hint('orgType')}
      <label htmlFor="or-province">{t('province')}</label>
      <select id="or-province" value={fields.province} onChange={set('province')} {...invalid('province')}>
        <option value="">{t('provincePick')}</option>
        {THAI_PROVINCES.map(province => <option key={province} value={province}>{provinceName(province, locale)}</option>)}
      </select>
      {hint('province')}
      <label htmlFor="or-phone">{t('phone')}</label>
      <input id="or-phone" type="tel" inputMode="tel" value={fields.phone} onChange={set('phone')} maxLength={20} autoComplete="tel" placeholder="08x-xxx-xxxx" {...invalid('phone')} />
      {hint('phone')}
      <label htmlFor="or-note">{t('note')}</label>
      <textarea id="or-note" rows={3} value={fields.note} onChange={set('note')} maxLength={500} placeholder={t('notePlaceholder')} {...invalid('note')} />
      {hint('note')}
      <p className="or-note">{t('privacy')}</p>
      {error && <p className="or-field-error" role="alert">{error}</p>}
      <button className="gl-btn gl-btn-primary or-cta" type="submit" disabled={sending}>{sending ? t('sending') : t('submit')}</button>
    </form>
  )
}
