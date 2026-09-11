import { NextResponse } from 'next/server'
import { ACCOUNT_DELETION_CONFIRM_PHRASE, deleteAthleteData } from '@/lib/account-deletion'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'account-data-deletion', limit: 3, windowSeconds: 60 * 60 })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
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

  const body = (await request.json().catch(() => null)) as { confirm?: string } | null
  if (body?.confirm?.trim() !== ACCOUNT_DELETION_CONFIRM_PHRASE) {
    return NextResponse.json({ error: `กรุณาพิมพ์ "${ACCOUNT_DELETION_CONFIRM_PHRASE}" เพื่อยืนยัน` }, { status: 400 })
  }

  const result = await deleteAthleteData(supabase, user.id, '/api/account/delete-athlete-data')
  return NextResponse.json(result.ok ? result : { error: result.error }, { status: result.ok ? 200 : result.status })
}
