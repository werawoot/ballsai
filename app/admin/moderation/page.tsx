import Link from 'next/link'
import { ArrowLeft, ShieldAlert, Trophy } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import HighlightModerationList, { type ModerationItem } from './HighlightModerationList'

type ReportRow = {
  id: number
  highlight_id: number
  reason: string
  created_at: string
}

type HighlightRow = {
  id: number
  title: string
  media_type: 'image' | 'video'
  moderation_status: 'visible' | 'hidden'
  athlete_id: string
  created_at: string
}

export default async function HighlightModerationPage() {
  const supabase = await createServerSupabaseClient()

  // Reports are read first: the queue is driven by what someone flagged, and the hidden
  // list below is the record of what the team has already acted on.
  const [{ data: reports, error: reportsError }, { data: hidden }] = await Promise.all([
    supabase
      .from('athlete_highlight_reports')
      .select('id, highlight_id, reason, created_at')
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('athlete_highlights')
      .select('id, title, media_type, moderation_status, athlete_id, created_at')
      .eq('moderation_status', 'hidden')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const reportRows = (reports ?? []) as ReportRow[]
  const hiddenRows = (hidden ?? []) as HighlightRow[]
  const reportedIds = [...new Set(reportRows.map(report => report.highlight_id))]

  const { data: reported } = reportedIds.length
    ? await supabase
      .from('athlete_highlights')
      .select('id, title, media_type, moderation_status, athlete_id, created_at')
      .in('id', reportedIds)
    : { data: [] as HighlightRow[] }

  const highlightRows = [...((reported ?? []) as HighlightRow[]), ...hiddenRows]
  const athleteIds = [...new Set(highlightRows.map(row => row.athlete_id))]
  const { data: athletes } = athleteIds.length
    ? await supabase.from('athlete_profiles').select('user_id, display_name').in('user_id', athleteIds)
    : { data: [] as Array<{ user_id: string; display_name: string }> }

  const athleteName = new Map((athletes ?? []).map(athlete => [athlete.user_id, athlete.display_name || 'ไม่ระบุชื่อ']))
  const toItem = (row: HighlightRow): ModerationItem => ({
    id: row.id,
    title: row.title,
    mediaType: row.media_type,
    moderationStatus: row.moderation_status,
    athleteName: athleteName.get(row.athlete_id) ?? 'ไม่ระบุชื่อ',
    createdAt: row.created_at,
    reports: reportRows
      .filter(report => report.highlight_id === row.id)
      .map(report => ({ id: report.id, reason: report.reason, createdAt: report.created_at })),
  })

  const queue = ((reported ?? []) as HighlightRow[]).map(toItem)
  const hiddenItems = hiddenRows.filter(row => !reportedIds.includes(row.id)).map(toItem)
  const setupNeeded = Boolean(reportsError)

  return (
    <main style={{ background: '#f8f8f8', minHeight: '100vh', paddingBottom: 40 }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: 54, background: '#CC0001', boxShadow: '0 2px 12px rgba(204,0,1,0.3)' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 800, letterSpacing: 2, color: 'white', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <Trophy size={22} strokeWidth={2.5} /> BallDoenSai.com
        </Link>
        <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          <ArrowLeft size={16} /> กลับ
        </Link>
      </header>

      <div style={{ background: '#CC0001', padding: '20px 16px 36px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(-45deg,transparent,transparent 20px,rgba(255,255,255,0.03) 20px,rgba(255,255,255,0.03) 21px)' }} />
        <div style={{ position: 'relative' }}>
          <h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 'clamp(28px,8vw,48px)', fontWeight: 700, color: 'white', lineHeight: 0.9, textTransform: 'uppercase' }}>
            HIGHLIGHT<br />
            <span style={{ WebkitTextStroke: '2px rgba(255,255,255,0.4)', color: 'transparent' }}>MODERATION</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 10 }}>ตรวจเนื้อหาที่ถูกรายงาน · ซ่อนได้ทันทีและกู้คืนได้</p>
        </div>
      </div>

      <svg viewBox="0 0 375 28" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 28, marginTop: -1 }}>
        <path d="M0,0 C100,28 275,0 375,20 L375,0 Z" fill="#CC0001" />
      </svg>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {setupNeeded && (
          <div style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 12, padding: '12px 14px', fontSize: 12, fontWeight: 700, lineHeight: 1.7 }}>
            ยังอ่านคิวรายงานไม่ได้ — กรุณา apply <code>sql/highlight-moderation-v1.sql</code> ใน Supabase project ที่ถูกต้องก่อน
          </div>
        )}

        <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e5e5e5', padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase', marginBottom: 12 }}>
            <ShieldAlert size={17} /> รอตรวจ ({queue.length})
          </div>
          <HighlightModerationList items={queue} emptyText="ไม่มีเนื้อหาที่ถูกรายงานรอตรวจ" />
        </div>

        <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e5e5e5', padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#111', textTransform: 'uppercase', marginBottom: 12 }}>
            ซ่อนอยู่ ({hiddenItems.length})
          </div>
          <HighlightModerationList items={hiddenItems} emptyText="ยังไม่มีเนื้อหาที่ถูกซ่อน" />
        </div>
      </div>
    </main>
  )
}
