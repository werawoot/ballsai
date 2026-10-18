'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Copy, QrCode, RefreshCw } from 'lucide-react'
import ConfirmButton from '@/components/ConfirmButton'
import { useApiErrorText } from '@/lib/use-api-error-text'
import { lineShareUrl, postTeamJoin } from '@/lib/team-join'

// The head coach's join link for an own team (ADR-011): copy it, send it to LINE, or show a
// QR code to scan at the field. A new link stops the old one at once; closing stops requests.
// `url` is null before sql/83, when the panel says the feature is not on yet.
export default function JoinLinkPanel({ teamId, teamName, url, open }: { teamId: string; teamName: string; url: string | null; open: boolean }) {
  const t = useTranslations('teamJoin')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [qr, setQr] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  if (!url) return <p className="tp-note">{t('notReady')}</p>

  const copy = async () => {
    const done = await navigator.clipboard?.writeText(url).then(() => true, () => false)
    setMessage(done ? { tone: 'ok', text: t('copied') } : { tone: 'error', text: t('copyFailed') })
  }
  const showQr = async () => {
    if (qr) { setQr(null); return }
    const { toDataURL } = await import('qrcode')
    setQr(await toDataURL(url, { margin: 1, width: 240 }))
  }
  const update = async (action: 'rotate' | 'open', extra: Record<string, unknown> = {}) => {
    if (busy) return
    setBusy(true); setMessage(null); setQr(null)
    const result = await postTeamJoin(action, { teamId, ...extra })
    setBusy(false)
    if (!result.ok) { setMessage({ tone: 'error', text: errorText(result.body, t('updateFailed')) }); return }
    setMessage({ tone: 'ok', text: action === 'rotate' ? t('rotated') : extra.open ? t('opened') : t('closed') })
    router.refresh()
  }

  return <div className="ui-card tj-card">
    <p className="tp-note">{t('linkIntro')}</p>
    {!open && <p className="tp-alert" role="status">{t('closedNote')}</p>}
    <input className="tj-url" readOnly value={url} aria-label={t('linkLabel')} onFocus={event => event.currentTarget.select()} />
    <div className="tj-actions">
      <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={copy}><Copy size={15} aria-hidden="true" />{t('copy')}</button>
      <a className="ui-btn ui-btn-ghost ui-btn-sm tj-line" href={lineShareUrl(t('shareText', { team: teamName, url }))} target="_blank" rel="noopener noreferrer">{t('line')}</a>
      <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" aria-expanded={Boolean(qr)} onClick={showQr}><QrCode size={15} aria-hidden="true" />{qr ? t('hideQr') : t('qr')}</button>
    </div>
    {/* A data: URL made in the browser; there is nothing for next/image to optimise. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {qr && <figure className="tj-qr"><img src={qr} alt={t('qrAlt', { team: teamName })} width={240} height={240} /><figcaption className="tp-note">{t('qrHint')}</figcaption></figure>}
    {message && <p className={message.tone === 'ok' ? 'tp-ok' : 'tp-alert'} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
    <div className="tj-actions tj-manage">
      <ConfirmButton label={t('rotate')} icon={<RefreshCw size={14} aria-hidden="true" />} question={t('rotateQuestion')} disabled={busy} onConfirm={() => update('rotate')} />
      <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={busy} onClick={() => update('open', { open: !open })}>{open ? t('close') : t('open')}</button>
    </div>
  </div>
}
