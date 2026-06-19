import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logServerError, logServerEvent } from '@/lib/monitoring'

const MAX_SLIP_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_SLIP_TYPES = ['image/jpeg', 'image/png', 'image/webp']

type TeamPaymentQuery = {
  id: string
  tournament_id: string
  created_by: string
  tournaments: {
    fee: number | null
    promptpay: string | null
    status: string
  } | {
    fee: number | null
    promptpay: string | null
    status: string
  }[] | null
}

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation
}

export async function POST(
  request: Request,
  { params }: { params: { teamId: string } }
) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  }

  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, tournament_id, created_by, tournaments(fee, promptpay, status)')
    .eq('id', params.teamId)
    .single()

  if (teamError || !team) {
    return NextResponse.json({ error: 'ไม่พบทีมที่ต้องการชำระเงิน' }, { status: 404 })
  }

  const typedTeam = team as TeamPaymentQuery
  const tournament = firstRelation(typedTeam.tournaments)

  if (typedTeam.created_by !== user.id) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์อัปโหลดสลิปให้ทีมนี้' }, { status: 403 })
  }

  if (tournament?.status !== 'open') {
    return NextResponse.json({ error: 'รายการนี้ปิดรับสมัครแล้ว' }, { status: 400 })
  }

  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id')
    .eq('team_id', params.teamId)
    .maybeSingle()

  if (existingPayment) {
    return NextResponse.json({ error: 'ทีมนี้มีรายการชำระเงินอยู่แล้ว' }, { status: 409 })
  }

  const formData = await request.formData()
  const slip = formData.get('slip')

  if (!(slip instanceof File)) {
    return NextResponse.json({ error: 'กรุณาแนบสลิปการชำระเงิน' }, { status: 400 })
  }

  if (!ALLOWED_SLIP_TYPES.includes(slip.type)) {
    return NextResponse.json({ error: 'สลิปต้องเป็นไฟล์ JPG, PNG หรือ WEBP' }, { status: 400 })
  }

  if (slip.size > MAX_SLIP_SIZE_BYTES) {
    return NextResponse.json({ error: 'ไฟล์สลิปต้องมีขนาดไม่เกิน 5 MB' }, { status: 400 })
  }

  const fileExt = slip.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const fileName = `${user.id}_${params.teamId}_${Date.now()}.${fileExt}`
  const fileBuffer = await slip.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from('slips')
    .upload(fileName, fileBuffer, {
      contentType: slip.type,
      upsert: false,
    })

  if (uploadError) {
    logServerError({
      event: 'payment_slip_upload_failed',
      userId: user.id,
      route: '/api/teams/[teamId]/payment',
      metadata: { teamId: params.teamId, fileType: slip.type, fileSize: slip.size },
      error: uploadError,
    })
    return NextResponse.json({ error: uploadError.message }, { status: 400 })
  }

  const { data: publicUrlData } = supabase.storage.from('slips').getPublicUrl(fileName)
  const { error: paymentError } = await supabase.from('payments').insert({
    team_id: params.teamId,
    tournament_id: typedTeam.tournament_id,
    user_id: user.id,
    amount: tournament?.fee ?? 0,
    promptpay: tournament?.promptpay ?? '',
    slip_url: publicUrlData.publicUrl,
    status: 'pending',
  })

  if (paymentError) {
    logServerError({
      event: 'payment_record_create_failed',
      userId: user.id,
      route: '/api/teams/[teamId]/payment',
      metadata: { teamId: params.teamId },
      error: paymentError,
    })
    return NextResponse.json({ error: paymentError.message }, { status: 400 })
  }

  logServerEvent({
    event: 'payment_slip_uploaded',
    userId: user.id,
    route: '/api/teams/[teamId]/payment',
    metadata: { teamId: params.teamId, tournamentId: typedTeam.tournament_id },
  })

  return NextResponse.json({ ok: true })
}
