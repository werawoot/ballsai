import Link from 'next/link'
import { ArrowLeft, ChevronRight, Clock3, FileClock, Filter, ShieldCheck, UserRound } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type AuditRow = {
  id: string
  actor_label: string
  action: string
  target_type: string
  target_id: string | null
  summary: string
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  created_at: string
}

const actionLabels: Record<string, string> = {
  'ranking.create': 'สร้าง Ranking',
  'ranking.update': 'แก้ไข Ranking',
  'ranking.delete': 'ลบ Ranking',
  'hall_of_fame.award': 'Hall of Fame',
  'trust.dispute.resolve': 'ตัดสินข้อโต้แย้ง',
  'moderation.highlight.hide': 'ซ่อน Highlight',
  'moderation.highlight.unhide': 'คืน Highlight',
  'moderation.highlight.delete': 'ลบ Highlight',
}

const targetLabels: Record<string, string> = {
  player_rank: 'Ranking',
  hall_of_fame_entry: 'Hall of Fame',
  data_dispute: 'Trust',
  athlete_highlight: 'Highlight',
}

const visibleFields: Record<string, string> = {
  player_name: 'นักกีฬา', team: 'ทีม', province: 'จังหวัด', position: 'ตำแหน่ง',
  ovr: 'OVR', pts: 'Power', pac: 'PAC', sho: 'SHO', pas: 'PAS', dri: 'DRI', def: 'DEF',
  rank_change: 'Rank change', sport: 'กีฬา', season: 'ฤดูกาล', category: 'รางวัล',
  age_group: 'รุ่นอายุ', status: 'สถานะ', moderation_status: 'Moderation', citation: 'คำเชิดชู',
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return 'ข้อมูลโครงสร้าง'
}

function Changes({ before, after }: { before: AuditRow['before_data']; after: AuditRow['after_data'] }) {
  const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]))
    .filter(key => key in visibleFields && before?.[key] !== after?.[key])
    .slice(0, 8)
  if (!keys.length) return null
  return <div className="audit-changes">{keys.map(key => <span key={key}><b>{visibleFields[key]}</b><i>{valueText(before?.[key])}</i><ChevronRight size={11} /><strong>{valueText(after?.[key])}</strong></span>)}</div>
}

export default async function AdminAuditPage({ searchParams }: { searchParams?: { action?: string; target?: string; before?: string } }) {
  const supabase = await createServerSupabaseClient()
  const action = (searchParams?.action ?? '').slice(0, 80)
  const target = (searchParams?.target ?? '').slice(0, 50)
  const before = searchParams?.before && !Number.isNaN(Date.parse(searchParams.before)) ? searchParams.before : ''

  let query = supabase.from('admin_audit_logs')
    .select('id,actor_label,action,target_type,target_id,summary,before_data,after_data,created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(31)
  if (action) query = query.eq('action', action)
  if (target) query = query.eq('target_type', target)
  if (before) query = query.lt('created_at', before)
  const { data, error } = await query
  const setupRequired = error?.code === '42P01' || Boolean(error?.message.includes('admin_audit_logs'))
  const rows = setupRequired ? [] : (data ?? []) as AuditRow[]
  const shown = rows.slice(0, 30)
  const nextCursor = rows.length > 30 ? shown.at(-1)?.created_at : null
  const makeHref = (params: Record<string, string>) => {
    const queryParams = new URLSearchParams({ ...(action ? { action } : {}), ...(target ? { target } : {}), ...params })
    return `/admin/audit?${queryParams.toString()}`
  }

  return <main className="audit-page">
    <header className="audit-topbar"><Link href="/admin/operations"><ArrowLeft size={17} /> Command Center</Link><span><ShieldCheck size={15} /> APPEND-ONLY ADMIN RECORD</span></header>
    <section className="audit-hero"><div><p>CONTROL PLANE · EVIDENCE</p><h1>ADMIN<br /><em>AUDIT TRAIL.</em></h1><span>ดูว่าใครเปลี่ยนอะไร เมื่อไร และค่าใดเปลี่ยน โดยไม่แสดงอีเมลหรือข้อมูลลับของผู้ใช้</span></div><FileClock size={88} strokeWidth={1.1} /></section>

    <section className="audit-body">
      <form className="audit-filters">
        <span><Filter size={15} /> กรองประวัติ</span>
        <select name="action" defaultValue={action} aria-label="กรองตามคำสั่ง"><option value="">ทุกคำสั่ง</option>{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select name="target" defaultValue={target} aria-label="กรองตามประเภทข้อมูล"><option value="">ข้อมูลทุกประเภท</option>{Object.entries(targetLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <button type="submit">แสดงผล</button>
        {(action || target) && <Link href="/admin/audit">ล้างตัวกรอง</Link>}
      </form>

      {setupRequired ? <section className="audit-setup"><ShieldCheck size={30} /><div><b>Audit Log พร้อมในโค้ด แต่ฐานข้อมูลยังไม่เปิดใช้</b><p>ต้องตรวจและ apply <code>sql/35-admin-audit-log-v1.sql</code> ก่อน deploy ฟังก์ชันนี้ การดำเนินการ Ranking และ Hall of Fame จะหยุดอย่างปลอดภัยจนกว่า Audit จะพร้อม</p></div></section>
      : error ? <section className="audit-setup audit-error"><b>โหลดประวัติไม่สำเร็จ</b><p>ระบบไม่ได้เปลี่ยนแปลงข้อมูลใด ๆ กรุณาลองใหม่หรือตรวจ Logs</p></section>
      : shown.length === 0 ? <section className="audit-empty"><FileClock size={35} /><b>ยังไม่มีประวัติตามตัวกรองนี้</b><p>รายการใหม่จะเกิดเมื่อแอดมินดำเนินการผ่านหน้า BallDoenSai หลัง SQL35 พร้อมใช้งาน</p></section>
      : <div className="audit-timeline">{shown.map(row => <article key={row.id}>
        <div className="audit-dot"><Clock3 size={14} /></div>
        <div className="audit-card">
          <div className="audit-card-head"><div><span>{actionLabels[row.action] ?? row.action}</span><small>{targetLabels[row.target_type] ?? row.target_type}{row.target_id ? ` · ${row.target_id.slice(0, 8)}` : ''}</small></div><time dateTime={row.created_at}>{new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(row.created_at))}</time></div>
          <h2>{row.summary}</h2>
          <p className="audit-actor"><UserRound size={14} /> {row.actor_label}</p>
          <Changes before={row.before_data} after={row.after_data} />
        </div>
      </article>)}</div>}

      {nextCursor && <Link className="audit-more" href={makeHref({ before: nextCursor })}>ดูรายการเก่ากว่า <ChevronRight size={15} /></Link>}
      <p className="audit-footnote">Audit เป็นบันทึกแบบเพิ่มอย่างเดียว หน้าเว็บไม่มีคำสั่งแก้ไขหรือลบ และเก็บเฉพาะข้อมูลประกอบที่จำเป็นต่อการตรวจสอบ</p>
    </section>
  </main>
}
