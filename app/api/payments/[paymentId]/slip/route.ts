import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

type PaymentSlip = {
  id: string
  user_id: string
  slip_url: string | null
  tournaments: { organizer_id: string } | { organizer_id: string }[] | null
}

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation
}

export async function GET(
  _request: Request,
  { params }: { params: { paymentId: string } },
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })

  const [{ data: profile }, { data: payment, error: paymentError }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase
      .from('payments')
      .select('id, user_id, slip_url, tournaments(organizer_id)')
      .eq('id', params.paymentId)
      .single(),
  ])

  if (paymentError || !payment) return NextResponse.json({ error: 'ไม่พบสลิปการชำระเงิน' }, { status: 404 })

  const typedPayment = payment as PaymentSlip
  const tournament = firstRelation(typedPayment.tournaments)
  const canRead = typedPayment.user_id === user.id || profile?.role === 'admin' || tournament?.organizer_id === user.id
  if (!canRead || !typedPayment.slip_url) return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูสลิปนี้' }, { status: 403 })

  // Legacy public URLs remain viewable during migration. New uploads store only
  // an object path and receive a 60-second signed URL.
  if (/^https?:\/\//.test(typedPayment.slip_url)) {
    return NextResponse.redirect(typedPayment.slip_url)
  }

  const { data: signedUrl, error: signedUrlError } = await supabase.storage
    .from('slips')
    .createSignedUrl(typedPayment.slip_url, 60)

  if (signedUrlError || !signedUrl?.signedUrl) {
    return NextResponse.json({ error: 'ไม่สามารถเปิดสลิปได้ในขณะนี้' }, { status: 500 })
  }

  return NextResponse.redirect(signedUrl.signedUrl)
}
