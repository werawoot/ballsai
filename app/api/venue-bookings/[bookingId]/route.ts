import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { apiError } from '@/lib/api-error'

type RpcError = { code?: string; message?: string }

function bookingRpcError(error: RpcError, action: 'respond' | 'cancel') {
  const message = error.message ?? ''
  if (message.includes('AUTH_REQUIRED')) {
    return apiError('signInAgain', 401)
  }
  if (message.includes('VENUE_OWNER_REQUIRED')) {
    return apiError('bookingOwnerRequired', 403)
  }
  if (message.includes('BOOKING_NOT_CANCELLABLE') || message.includes('BOOKING_NOT_PENDING')) {
    return apiError('bookingStatusChanged', 409)
  }
  if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01') {
    return apiError('bookingMigrationMissing', 503, { migration: 'sql/23-venues-and-bookings-v1.sql' })
  }
  return apiError(action === 'respond' ? 'bookingRespondFailed' : 'bookingCancelFailed', 400)
}

export async function PATCH(request: Request, { params }: { params: { bookingId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('signInFirst', 401)
  const body = await request.json().catch(() => null) as { status?: string } | null
  if (body?.status !== 'confirmed' && body?.status !== 'declined') return apiError('bookingStatusInvalid', 400)
  const { error } = await supabase.rpc('respond_venue_booking_safely', { p_booking_id: params.bookingId, p_status: body.status })
  if (error?.message?.includes('BOOKING_NOT_PENDING')) {
    const { data: booking } = await supabase.from('venue_booking_requests').select('status').eq('id', params.bookingId).maybeSingle()
    if (booking?.status === body.status) return NextResponse.json({ ok: true, alreadyResponded: true })
  }
  if (error) return bookingRpcError(error, 'respond')
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: { bookingId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('signInFirst', 401)
  const { error } = await supabase.rpc('cancel_venue_booking_safely', { p_booking_id: params.bookingId })
  if (error) return bookingRpcError(error, 'cancel')
  return NextResponse.json({ ok: true })
}
