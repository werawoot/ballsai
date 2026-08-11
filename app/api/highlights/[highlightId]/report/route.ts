import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logServerError, logServerEvent } from '@/lib/monitoring'
import { checkRateLimit } from '@/lib/rate-limit'

const MAX_REASON_LENGTH = 400

export async function POST(
  request: Request,
  { params }: { params: { highlightId: string } },
) {
  const rateLimit = await checkRateLimit(request, { scope: 'highlight-report', limit: 5, windowSeconds: 10 * 60 })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'ส่งรายงานบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    )
  }

  const highlightId = Number(params.highlightId)
  if (!Number.isSafeInteger(highlightId) || highlightId < 1) {
    return NextResponse.json({ error: 'ไม่พบ Highlight' }, { status: 404 })
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อนรายงานเนื้อหา' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { reason?: string } | null
  const reason = body?.reason?.trim()
  if (!reason) {
    return NextResponse.json({ error: 'กรุณาระบุเหตุผลในการรายงาน' }, { status: 400 })
  }

  const { error } = await supabase.from('athlete_highlight_reports').insert({
    highlight_id: highlightId,
    reporter_id: user.id,
    reason: reason.slice(0, MAX_REASON_LENGTH),
  })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'คุณรายงาน Highlight นี้ไว้แล้ว ทีมดูแลกำลังตรวจสอบ' }, { status: 409 })
    }
    if (error.code === '23503') {
      return NextResponse.json({ error: 'ไม่พบ Highlight ที่ต้องการรายงาน' }, { status: 404 })
    }
    logServerError({
      event: 'highlight_report_failed',
      userId: user.id,
      route: '/api/highlights/[highlightId]/report',
      metadata: { highlightId, code: error.code },
      error,
    })
    // The table ships as sql/highlight-moderation-v1.sql and must be applied first.
    if (error.code === '42P01' || error.message.includes('does not exist')) {
      return NextResponse.json(
        { error: 'ฐานข้อมูลยังไม่มีระบบรายงานเนื้อหา กรุณา apply sql/highlight-moderation-v1.sql ก่อน' },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: 'ส่งรายงานไม่สำเร็จ' }, { status: 400 })
  }

  logServerEvent({
    event: 'highlight_reported',
    userId: user.id,
    route: '/api/highlights/[highlightId]/report',
    metadata: { highlightId },
  })

  return NextResponse.json({ ok: true })
}
