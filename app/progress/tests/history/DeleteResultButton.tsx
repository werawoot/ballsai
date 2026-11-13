'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { SelfTestKey } from '@/lib/training/self-tests'

// Deletes one of the athlete's own results through delete_my_self_test (SQL96), which removes
// only the signed-in athlete's row for that test and day.
export default function DeleteResultButton({ test, date, label, confirm, failed }: { test: SelfTestKey; date: string; label: string; confirm: string; failed: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function remove() {
    if (!window.confirm(confirm)) return
    setBusy(true)
    setError(false)
    const { error: rpcError } = await createClient().rpc('delete_my_self_test', { p_test: test, p_date: date })
    setBusy(false)
    if (rpcError) { setError(true); return }
    router.refresh()
  }

  return <span className="st-delete">
    <button type="button" className="pf-btn pf-btn-ghost" onClick={remove} disabled={busy} aria-describedby={error ? `del-${date}` : undefined}>{label}</button>
    {error && <span id={`del-${date}`} className="pf-note" role="alert">{failed}</span>}
  </span>
}
