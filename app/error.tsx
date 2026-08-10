'use client'

import Link from 'next/link'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Unhandled application error', error)
  }, [error])

  return (
    <main className="site-fallback">
      <p className="site-fallback-kicker">BALLDOENSAI.COM · SYSTEM NOTICE</p>
      <h1>เกมนี้สะดุด<br /><em>แต่เรายังไปต่อได้</em></h1>
      <p>เกิดปัญหาชั่วคราวระหว่างเปิดหน้านี้ ลองอีกครั้ง หรือกลับไปเริ่มต้นใหม่ได้เลย</p>
      <div className="site-fallback-actions">
        <button type="button" onClick={reset}>ลองอีกครั้ง</button>
        <Link href="/">กลับหน้าแรก</Link>
      </div>
    </main>
  )
}
