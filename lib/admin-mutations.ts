import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function getAdminMutationContext() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 }) }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') {
    return { response: NextResponse.json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403 }) }
  }
  return { supabase, user }
}

export function auditedSchemaError(code?: string, message?: string) {
  return code === 'PGRST202' || code === '42883' || code === '42P01'
    || Boolean(message?.includes('admin_audit_logs'))
    || Boolean(message?.includes('_with_audit'))
}
