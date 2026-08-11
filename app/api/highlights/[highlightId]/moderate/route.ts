import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logServerError, logServerEvent } from '@/lib/monitoring'

type ModerateBody = {
  action?: 'hide' | 'unhide' | 'delete'
}

export async function POST(
  request: Request,
  { params }: { params: { highlightId: string } },
) {
  const highlightId = Number(params.highlightId)
  if (!Number.isSafeInteger(highlightId) || highlightId < 1) {
    return NextResponse.json({ error: 'ไม่พบ Highlight' }, { status: 404 })
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as ModerateBody | null
  const action = body?.action
  if (action !== 'hide' && action !== 'unhide' && action !== 'delete') {
    return NextResponse.json({ error: 'คำสั่งไม่ถูกต้อง' }, { status: 400 })
  }

  const { data: highlight, error: lookupError } = await supabase
    .from('athlete_highlights')
    .select('id, athlete_id, media_path')
    .eq('id', highlightId)
    .maybeSingle()

  if (lookupError || !highlight) {
    return NextResponse.json({ error: 'ไม่พบ Highlight' }, { status: 404 })
  }

  if (action === 'delete') {
    // Storage first: a deleted row would otherwise leave an unreachable object behind.
    const { error: storageError } = await supabase.storage.from('athlete-highlights').remove([highlight.media_path])
    if (storageError) {
      logServerError({
        event: 'highlight_moderation_failed',
        userId: user.id,
        route: '/api/highlights/[highlightId]/moderate',
        metadata: { highlightId, action, stage: 'storage' },
        error: storageError,
      })
      return NextResponse.json({ error: 'ลบไฟล์ไม่สำเร็จ กรุณาลองใหม่' }, { status: 400 })
    }
    const { error: deleteError } = await supabase.from('athlete_highlights').delete().eq('id', highlightId)
    if (deleteError) {
      logServerError({
        event: 'highlight_moderation_failed',
        userId: user.id,
        route: '/api/highlights/[highlightId]/moderate',
        metadata: { highlightId, action, stage: 'row' },
        error: deleteError,
      })
      return NextResponse.json({ error: 'ลบ Highlight ไม่สำเร็จ' }, { status: 400 })
    }
  } else {
    const hiding = action === 'hide'
    const { error: updateError } = await supabase
      .from('athlete_highlights')
      .update({
        moderation_status: hiding ? 'hidden' : 'visible',
        hidden_at: hiding ? new Date().toISOString() : null,
        hidden_by: hiding ? user.id : null,
      })
      .eq('id', highlightId)

    if (updateError) {
      logServerError({
        event: 'highlight_moderation_failed',
        userId: user.id,
        route: '/api/highlights/[highlightId]/moderate',
        metadata: { highlightId, action, code: updateError.code },
        error: updateError,
      })
      if (updateError.code === '42703' || updateError.message.includes('moderation_status')) {
        return NextResponse.json(
          { error: 'ฐานข้อมูลยังไม่มีระบบ moderation กรุณา apply sql/highlight-moderation-v1.sql ก่อน' },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: 'อัปเดตสถานะไม่สำเร็จ' }, { status: 400 })
    }
  }

  // Acting on a clip closes its open reports either way: the queue should show what the
  // team has not looked at yet, not everything that was ever reported.
  await supabase
    .from('athlete_highlight_reports')
    .update({ resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq('highlight_id', highlightId)
    .is('resolved_at', null)

  logServerEvent({
    event: 'highlight_moderated',
    userId: user.id,
    route: '/api/highlights/[highlightId]/moderate',
    metadata: { highlightId, action, athleteId: highlight.athlete_id },
  })

  return NextResponse.json({ ok: true })
}
