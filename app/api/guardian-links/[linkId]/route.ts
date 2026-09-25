import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function PATCH(request: Request, { params }: { params: { linkId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const body = await request.json().catch(() => null) as { status?: string } | null
  if (!['accepted', 'declined'].includes(body?.status ?? '')) return NextResponse.json({ error: 'สถานะไม่ถูกต้อง' }, { status: 400 })
  const { error } = await supabase.rpc('respond_guardian_link', { p_link_id: params.linkId, p_status: body?.status })
  if (error) return NextResponse.json({ error: 'อัปเดตคำขอไม่สำเร็จ' }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: { linkId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const { error } = await supabase.rpc('revoke_guardian_link', { p_link_id: params.linkId })
  if (error) return NextResponse.json({ error: 'ยกเลิกการเชื่อมบัญชีไม่สำเร็จ' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
