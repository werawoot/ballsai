import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  const body = await request.json().catch(() => null) as { brandName?: string; description?: string; websiteUrl?: string } | null
  if (!body?.brandName?.trim()) return NextResponse.json({ error: 'กรุณาระบุชื่อแบรนด์หรือองค์กร' }, { status: 400 })
  const { error } = await supabase.rpc('create_sponsor_profile_safely', {
    p_brand_name: body.brandName.trim(), p_description: body.description?.trim() ?? '', p_website_url: body.websiteUrl?.trim() ?? '',
  })
  return error ? NextResponse.json({ error: 'บันทึก Brand Profile ไม่สำเร็จ' }, { status: 400 }) : NextResponse.json({ ok: true })
}
