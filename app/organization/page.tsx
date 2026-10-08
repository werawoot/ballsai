import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import OrganizationClient from './OrganizationClient'
import PageHeader from '@/components/PageHeader'
import Pagination from '@/components/Pagination'
import { parsePage } from '@/lib/pagination'
import { fetchMyOrganizationsPage } from '@/lib/organization-desk'
// Only organizations the user has accepted, filtered in the query (not left to RLS), one
// page at a time; member counts come from the database. See lib/organization-desk.ts.
export default async function OrganizationPage(props:{searchParams?: Promise<{page?:string}>}) {
  const tl = await getTranslations('labels')
  const searchParams = (await props.searchParams) ?? {}
  const supabase=await createServerSupabaseClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login?next=/organization');const page=parsePage(searchParams.page);const {organizations,hasNext}=await fetchMyOrganizationsPage(supabase,{userId:user.id,page});return <main className="bds-page" style={{minHeight:'100vh',background:'#f7f7f5'}}><PageHeader /><section style={{background:'linear-gradient(110deg,#101827,#143f56)',color:'white',padding:'32px 18px'}}><div style={{maxWidth:850,margin:'0 auto'}}><p style={{color:'#f5c518',fontSize:10,fontWeight:900,letterSpacing:1.5,margin:0}}>{tl('organizationPage.eyebrow')}</p><h1 style={{font:'800 clamp(36px,7vw,58px)/.9 var(--font-oswald)',margin:'10px 0'}}>{tl('organizationPage.titleLine1')}<br/><span style={{color:'#f5c518'}}>{tl('organizationPage.titleLine2')}</span></h1><p style={{color:'rgba(255,255,255,.7)',fontSize:13}}>{tl('organizationPage.intro')}</p></div></section><section style={{maxWidth:850,margin:'0 auto',padding:'20px 16px'}}><OrganizationClient organizations={organizations}/><Pagination basePath="/organization" page={page} hasNext={hasNext}/></section></main>
}
