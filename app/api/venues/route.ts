import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

type CreateVenueBody = {
  name?: string
  province?: string
  address?: string
  contactPhone?: string
  description?: string
  amenities?: string[]
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })

  const body = await request.json().catch(() => null) as CreateVenueBody | null
  const name = body?.name?.trim()
  const province = body?.province?.trim()
  const address = body?.address?.trim()
  const contactPhone = body?.contactPhone?.trim()
  if (!name || !province || !address || !contactPhone) {
    return NextResponse.json({ error: 'กรอกชื่อสนาม จังหวัด ที่อยู่ และช่องทางติดต่อให้ครบ' }, { status: 400 })
  }

  const amenities = (body?.amenities ?? []).map(item => item.trim()).filter(Boolean).slice(0, 12)
  const { data, error } = await supabase.rpc('create_venue_profile_safely', {
    p_name: name,
    p_province: province,
    p_address: address,
    p_contact_phone: contactPhone,
    p_description: body?.description?.trim() ?? '',
    p_amenities: amenities,
  })
  if (error) return NextResponse.json({ error: 'สร้างสนามไม่สำเร็จ' }, { status: 400 })
  return NextResponse.json({ ok: true, venueId: data })
}
