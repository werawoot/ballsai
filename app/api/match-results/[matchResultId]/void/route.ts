import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logServerError, logServerEvent } from '@/lib/monitoring'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(
  request: Request,
  { params }: { params: { matchResultId: string } },
) {
  const rateLimit = await checkRateLimit(request, { scope: 'match-result-void', limit: 10, windowSeconds: 10 * 60 })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'ยกเลิกผลแข่งบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    )
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  }

  const { data: reverted, error } = await supabase.rpc('void_match_result_safely', {
    p_match_result_id: params.matchResultId,
  })

  if (error) {
    logServerError({
      event: 'match_result_void_failed',
      userId: user.id,
      route: '/api/match-results/[matchResultId]/void',
      metadata: { matchResultId: params.matchResultId, code: error.code },
      error,
    })

    const message = error.message ?? ''
    if (message.includes('MATCH_NOT_FOUND')) return NextResponse.json({ error: 'ไม่พบผลการแข่งขันนี้' }, { status: 404 })
    if (message.includes('ALREADY_VOID')) return NextResponse.json({ error: 'ผลนัดนี้ถูกยกเลิกไปแล้ว' }, { status: 409 })
    if (message.includes('FORBIDDEN') || message.includes('AUTH_REQUIRED')) {
      return NextResponse.json({ error: 'ยกเลิกได้เฉพาะผลแข่งในรายการของคุณ' }, { status: 403 })
    }
    if (message.includes('NEWER_RESULT_EXISTS')) {
      return NextResponse.json(
        { error: 'มีผลแข่งนัดใหม่กว่าที่บันทึกทับคะแนนของนักกีฬาไปแล้ว กรุณายกเลิกผลนัดล่าสุดก่อน' },
        { status: 409 },
      )
    }
    // The function ships as sql/match-result-void-v1.sql and must be applied first.
    if (error.code === '42883' || message.includes('does not exist')) {
      return NextResponse.json(
        { error: 'ฐานข้อมูลยังไม่มีระบบยกเลิกผลแข่ง กรุณา apply sql/match-result-void-v1.sql ก่อน' },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: 'ยกเลิกผลแข่งไม่สำเร็จ' }, { status: 400 })
  }

  logServerEvent({
    event: 'match_result_voided',
    userId: user.id,
    route: '/api/match-results/[matchResultId]/void',
    metadata: { matchResultId: params.matchResultId, revertedPerformances: reverted },
  })

  revalidateTag('public-ranking')

  return NextResponse.json({ ok: true, revertedPerformances: reverted })
}
