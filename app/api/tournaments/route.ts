import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { apiError } from '@/lib/api-error'
import { promptpayIssue } from '@/lib/promptpay'
import { createStatusFor, organizerRpcError } from '@/lib/organizer-access'

type CreateTournamentBody = {
  name?: string
  description?: string
  location?: string
  startDate?: string
  endDate?: string
  fee?: number
  promptpay?: string
  maxTeams?: number
  draft?: boolean
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // An organizer's tournament opens unless kept as a draft. Anyone else's is a draft, which
  // the database allows only with a pending organizer request, three at most (sql/89).
  const body = (await request.json()) as CreateTournamentBody
  const status = createStatusFor(profile?.role, body.draft === true)
  const name = body.name?.trim()
  const location = body.location?.trim()
  const startDate = body.startDate?.trim()
  const endDate = body.endDate?.trim() || startDate
  const fee = Number(body.fee)
  const maxTeams = Number(body.maxTeams)

  if (!name || !location || !startDate || !Number.isFinite(fee) || fee < 0) {
    return NextResponse.json({ error: 'ข้อมูลรายการแข่งขันไม่ครบถ้วน' }, { status: 400 })
  }

  if (!Number.isFinite(maxTeams) || maxTeams < 2) {
    return NextResponse.json({ error: 'จำนวนทีมสูงสุดต้องไม่น้อยกว่า 2 ทีม' }, { status: 400 })
  }

  const promptpay = body.promptpay?.trim() ?? ''
  const promptpayProblem = promptpayIssue(fee, promptpay)
  if (promptpayProblem) return apiError(promptpayProblem, 400)

  const { error } = await supabase.from('tournaments').insert({
    name,
    description: body.description?.trim() ?? '',
    location,
    start_date: startDate,
    end_date: endDate,
    fee,
    promptpay,
    max_teams: Math.floor(maxTeams),
    organizer_id: user.id,
    status,
  })

  if (error) {
    const known = organizerRpcError(error)
    if (known) return apiError(known.code, known.status)
    // Before sql/89 the insert policy refuses a non-organizer and the status check knows no 'draft'.
    if (status === 'draft' && (error.code === '23514' || error.code === '42501')) return apiError('featureNotReady', 503)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (status === 'open') revalidateTag('public-tournaments')

  return NextResponse.json({ ok: true, status })
}
