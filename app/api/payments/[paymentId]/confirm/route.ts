import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

type PaymentQueryResult = {
  id: string
  team_id: string
  tournament_id: string
  status: string
  tournaments: { organizer_id: string } | { organizer_id: string }[] | null
}

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation
}

export async function POST(
  _request: Request,
  { params }: { params: { paymentId: string } }
) {
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

  if (profile?.role !== 'organizer' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์ยืนยันการชำระเงิน' }, { status: 403 })
  }

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('id, team_id, tournament_id, status, tournaments(organizer_id)')
    .eq('id', params.paymentId)
    .single()

  if (paymentError || !payment) {
    return NextResponse.json({ error: 'ไม่พบรายการชำระเงิน' }, { status: 404 })
  }

  const typedPayment = payment as PaymentQueryResult
  const tournament = firstRelation(typedPayment.tournaments)
  const isAdmin = profile?.role === 'admin'

  if (!isAdmin && tournament?.organizer_id !== user.id) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์ยืนยันรายการนี้' }, { status: 403 })
  }

  const { error: confirmError } = await supabase.rpc('confirm_payment_safely', {
    p_payment_id: params.paymentId,
  })

  if (confirmError) {
    return NextResponse.json({ error: 'ยืนยันการชำระเงินไม่สำเร็จ กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
