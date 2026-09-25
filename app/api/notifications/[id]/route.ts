import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NOTIFICATION_UUID_PATTERN, notificationWriteError } from '@/lib/notification-mutations'

export async function PATCH(_request: Request, { params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })

  if (!NOTIFICATION_UUID_PATTERN.test(params.id)) {
    return NextResponse.json({ error: 'รหัสการแจ้งเตือนไม่ถูกต้อง' }, { status: 400 })
  }

  // read_at is the only column a recipient may write, and the user_id filter keeps the
  // write inside the row RLS already allows.
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return notificationWriteError(error)
  return NextResponse.json({ ok: true })
}
