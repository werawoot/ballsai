import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import InviteClient from './InviteClient'
type Invite={id:string;role:string;invited_at:string;organizations:{name:string;kind:string;province:string}|null}
export default async function Invites(){const s=await createServerSupabaseClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect('/login?next=/organization/invites');const {data}=await s.from('organization_members').select('id,role,invited_at,organizations(name,kind,province)').eq('user_id',user.id).eq('status','pending').order('invited_at',{ascending:false});return <main className="bds-page" style={{minHeight:'100vh',background:'#f7f7f5',padding:20}}><Link href="/organization">← องค์กรของฉัน</Link><h1>คำเชิญองค์กร</h1><InviteClient invites={(data??[]) as unknown as Invite[]}/></main>}
