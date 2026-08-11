import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(_: Request, { params }: { params: { highlightId: string } }) {
  const highlightId = Number(params.highlightId)
  if (!Number.isSafeInteger(highlightId) || highlightId < 1) {
    return NextResponse.json({ error: 'ไม่พบ Highlight' }, { status: 404 })
  }

  const supabase = await createServerSupabaseClient()
  const { data: highlight, error } = await supabase
    .from('athlete_highlights')
    .select('media_path, media_type')
    .eq('id', highlightId)
    .maybeSingle()

  if (error || !highlight) return NextResponse.json({ error: 'ไม่พบ Highlight หรือไม่มีสิทธิ์ดู' }, { status: 404 })

  const { data: media, error: mediaError } = await supabase.storage
    .from('athlete-highlights')
    .download(highlight.media_path)

  if (mediaError || !media) return NextResponse.json({ error: 'เปิดไฟล์ Highlight ไม่สำเร็จ' }, { status: 404 })
  return new NextResponse(media.stream(), {
    headers: {
      'Content-Type': media.type || (highlight.media_type === 'video' ? 'video/mp4' : 'image/jpeg'),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
