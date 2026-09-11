'use client'

import { useState } from 'react'

type GuardianConsentActionProps = {
  token: string
  mode: 'confirm' | 'revoke'
}

export default function GuardianConsentAction({ token, mode }: GuardianConsentActionProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const isRevoke = mode === 'revoke'

  async function submit() {
    setState('loading')
    setMessage('')
    const response = await fetch(`/api/guardian-verification/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const payload = await response.json().catch(() => null) as { error?: string } | null
    if (!response.ok) {
      setState('error')
      setMessage(payload?.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
      return
    }
    setState('success')
  }

  if (state === 'success') {
    return <p className="mt-6 rounded border border-green-700 bg-green-50 p-4 text-sm font-semibold text-green-900">
      {isRevoke ? 'ถอนความยินยอมแล้ว โปรไฟล์กีฬาของนักกีฬาถูกตั้งเป็นส่วนตัว' : 'ยืนยันเรียบร้อยแล้ว นักกีฬาสามารถเลือกเปิดเผยโปรไฟล์กีฬาได้'}
    </p>
  }

  return <>
    <button
      type="button"
      onClick={submit}
      disabled={state === 'loading'}
      className={`mt-6 w-full px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 ${isRevoke ? 'bg-[#111827]' : 'bg-[#d71920]'}`}
    >
      {state === 'loading' ? 'กำลังดำเนินการ...' : isRevoke ? 'ยืนยันการถอนความยินยอม' : 'ยืนยันการเปิดเผยโปรไฟล์'}
    </button>
    {state === 'error' && <p role="alert" className="mt-4 text-sm font-semibold text-[#b91c1c]">{message}</p>}
  </>
}
