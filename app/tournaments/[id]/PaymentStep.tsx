'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useApiErrorText, type ApiErrorBody } from '@/lib/use-api-error-text'
import { CheckCircle2, Copy, Lock, Upload } from 'lucide-react'
import { RegisterSteps, TournamentSummary, type TournamentSummaryProps } from './RegisterSteps'

// Step 3: pay and attach the slip. The slip goes to /api/teams/[id]/payment, which keeps
// it in the private `slips` bucket as an object path; nothing here makes a public URL
// (AGENTS.md rule 6). The preview is a local blob of the file the person chose.
// A free tournament (fee null) has nothing to pay: a submitted team is only waiting for the
// organizer (approvalAction offers "confirm team" with no payment), a draft one still has to
// be submitted from /team-members.
export default function PaymentStep({ tournamentId, teamId, teamName, teamStatus, fee, promptpay, summary, payment = null }: {
  tournamentId: string
  teamId: string
  teamName: string | null
  teamStatus: string | null
  fee: string | null
  promptpay: string | null
  summary: TournamentSummaryProps
  // The team's open payment, else its latest rejected one (sql/105); null when none was sent.
  payment?: { status: string; reason: string | null } | null
}) {
  const t = useTranslations('tournament')
  const router = useRouter()
  const errorText = useApiErrorText()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const choose = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0]
    if (!chosen) return
    setFile(chosen)
    setPreview(URL.createObjectURL(chosen))
  }

  const copy = async () => {
    if (!promptpay) return
    try {
      await navigator.clipboard.writeText(promptpay)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* the number stays on screen to type by hand */ }
  }

  const submit = async () => {
    if (!file || saving) return
    setSaving(true)
    setError('')
    const form = new FormData()
    form.append('slip', file)
    const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/payment`, { method: 'POST', body: form }).catch(() => null)
    if (response?.status === 401) {
      router.push(`/login?next=${encodeURIComponent(`/tournaments/${tournamentId}?teamId=${teamId}`)}`)
      return
    }
    const result = (await response?.json().catch(() => null)) as ApiErrorBody
    if (!response?.ok) {
      setError(errorText(result, t('slipFailed')))
      setSaving(false)
      return
    }
    setDone(true)
  }

  if (!fee) {
    const submitted = teamStatus !== null && teamStatus !== 'draft'
    return <div className="tn-detail-body">
      <RegisterSteps current={3} free />
      <TournamentSummary {...summary} />
      <div className="tn-done" role="status">
        {submitted && <CheckCircle2 size={64} strokeWidth={1.6} aria-hidden="true" />}
        <h1 className="ui-h1">{submitted ? t('freeDoneTitle') : t('freeDraftTitle')}</h1>
        <p>{submitted ? t('freeDoneText') : t('freeDraftText')}</p>
        {submitted
          ? <Link className="ui-btn ui-btn-primary" href={`/tournaments/${tournamentId}`}>{t('doneBack')}</Link>
          : <Link className="ui-btn ui-btn-primary" href="/team-members">{t('freeDraftCta')}</Link>}
      </div>
    </div>
  }

  if (payment?.status === 'confirmed' && !done) {
    return <div className="tn-detail-body tn-done" role="status">
      <CheckCircle2 size={64} strokeWidth={1.6} aria-hidden="true" />
      <h1 className="ui-h1">{t('paidTitle')}</h1>
      <p>{t('paidText')}</p>
      <Link className="ui-btn ui-btn-primary" href={`/tournaments/${tournamentId}`}>{t('doneBack')}</Link>
    </div>
  }

  if (done || payment?.status === 'pending') {
    return <div className="tn-detail-body tn-done" role="status">
      <CheckCircle2 size={64} strokeWidth={1.6} aria-hidden="true" />
      <h1 className="ui-h1">{t('doneTitle')}</h1>
      <p>{t('doneText')}</p>
      <Link className="ui-btn ui-btn-primary" href={`/tournaments/${tournamentId}`}>{t('doneBack')}</Link>
    </div>
  }

  return <div className="tn-detail-body">
    <RegisterSteps current={3} />
    <TournamentSummary {...summary} />
    <div className="ui-card tn-amount" style={{ marginTop: 14 }}>
      <div className="tn-amount-top">
        <small>{teamName ? t('amountFor', { team: teamName }) : t('amount')}</small>
        <b>{fee ?? t('free')}</b>
      </div>
      {promptpay
        ? <div className="tn-pp">
            <div><small>{t('promptpay')}</small><b>{promptpay}</b></div>
            <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={copy} type="button"><Copy size={15} aria-hidden="true" />{copied ? t('copied') : t('copy')}</button>
          </div>
        : fee && <p className="tn-info">{t('noPromptpay')}</p>}
    </div>
    {payment?.status === 'rejected' && <div className="tn-error" role="alert" style={{ marginTop: 14 }}>
      <b>{t('rejectedTitle')}</b>
      {payment.reason && <p>{t('rejectedReason', { reason: payment.reason })}</p>}
      <p>{t('rejectedHint')}</p>
    </div>}
    <section className="tn-section">
      <h2>{t('slipTitle')}</h2>
      <label className="tn-drop">
        <input accept="image/jpeg,image/png,image/webp" onChange={choose} type="file" />
        {preview
          ? <><Image alt={t('slipAlt')} height={900} src={preview} unoptimized width={640} /><span className="tn-drop-change">{t('slipChange')}</span></>
          : <span className="tn-drop-empty"><Upload size={26} aria-hidden="true" /><b>{t('slipPick')}</b><small>{t('slipTypes')}</small></span>}
      </label>
      <p className="tn-private"><Lock size={14} aria-hidden="true" /><span>{t('slipPrivate')}</span></p>
    </section>
    {error && <p className="tn-error" role="alert">{error}</p>}
    <div className="tn-dock"><div className="tn-dock-inner">
      <button className="ui-btn ui-btn-primary" disabled={!file || saving} onClick={submit} type="button">{saving ? t('slipSaving') : t('slipSubmit')}</button>
    </div></div>
  </div>
}
