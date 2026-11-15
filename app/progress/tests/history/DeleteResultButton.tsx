'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase'
import type { SelfTestKey } from '@/lib/training/self-tests'

// Deletes one of the athlete's own results through delete_my_self_test (SQL96), which removes
// only the signed-in athlete's row for that test and day. After the list refreshes, focus moves
// to the page heading, since the row and its button are gone (the row hides itself at once).
export default function DeleteResultButton({ test, date, dateLabel, onDeleted }: { test: SelfTestKey; date: string; dateLabel: string; onDeleted?: () => void }) {
  const t = useTranslations('selfTests.history')
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function remove() {
    if (!window.confirm(t('deleteConfirm', { date: dateLabel }))) return
    setBusy(true)
    setError(false)
    const { error: rpcError } = await createClient().rpc('delete_my_self_test', { p_test: test, p_date: date })
    if (rpcError) { setBusy(false); setError(true); return }
    onDeleted?.()
    router.refresh()
    document.getElementById('sh-title')?.focus()
  }

  return <span className="st-delete">
    <button type="button" className="pf-btn pf-btn-ghost" onClick={remove} disabled={busy} aria-label={t('deleteLabel', { date: dateLabel })} aria-describedby={error ? `del-${date}` : undefined}>{t('delete')}</button>
    {error && <span id={`del-${date}`} className="pf-note" role="alert">{t('deleteFailed')}</span>}
  </span>
}
