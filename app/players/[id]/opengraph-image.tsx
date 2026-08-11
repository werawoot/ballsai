import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'

export const alt = 'BallDoenSai Athlete Profile'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

type Player = { player_name: string; position: string; team: string; province: string; ovr: number; pts: number; pac: number; sho: number; pas: number; dri: number; def: number }

export default async function OpenGraphImage({ params }: { params: { id: string } }) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { data } = await supabase.from('player_ranks').select('player_name, position, team, province, ovr, pts, pac, sho, pas, dri, def').eq('id', params.id).maybeSingle()
  const player = data as Player | null
  const name = player?.player_name || 'BALLDOENSAI ATHLETE'
  const position = player?.position || 'PLAYER'
  const stats = player ? [['PAC', player.pac], ['SHO', player.sho], ['PAS', player.pas], ['DRI', player.dri], ['DEF', player.def]] : []

  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', color: 'white', background: 'linear-gradient(120deg,#07101f 8%,#1d3153 60%,#0a4c33)', padding: 52, position: 'relative' }}>
      <div style={{ position: 'absolute', width: 620, height: 620, borderRadius: 620, border: '2px solid rgba(244,185,66,.43)', right: -170, top: -195, display: 'flex' }} />
      <div style={{ position: 'absolute', width: 430, height: 430, borderRadius: 430, border: '1px solid rgba(255,255,255,.16)', right: -55, top: -102, display: 'flex' }} />
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '58%', zIndex: 1 }}>
        <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, letterSpacing: 3, color: '#f4c861' }}>⚽ BALLDOENSAI.COM · ATHLETE PASSPORT</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}><div style={{ display: 'flex', fontSize: 25, fontWeight: 700, color: '#ffb7ba', letterSpacing: 3 }}>{position}</div><div style={{ display: 'flex', fontSize: 76, fontWeight: 800, lineHeight: 1 }}>{name}</div><div style={{ display: 'flex', fontSize: 25, color: 'rgba(255,255,255,.72)', marginTop: 13 }}>{player ? `${player.team} · ${player.province}` : 'THAILAND YOUTH FOOTBALL'}</div></div>
        <div style={{ display: 'flex', fontSize: 22, color: 'rgba(255,255,255,.65)' }}>YOUR GAME · YOUR STORY</div>
      </div>
      <div style={{ width: '42%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
        <div style={{ width: 345, height: 465, display: 'flex', flexDirection: 'column', border: '5px solid #f4c861', padding: 26, borderRadius: 30, background: 'linear-gradient(155deg,#f5d453,#9a5a04 52%,#101827)', boxShadow: '0 25px 45px rgba(0,0,0,.35)' }}><div style={{ display: 'flex', fontSize: 93, fontWeight: 900, color: '#142033', lineHeight: .8 }}>{player?.ovr ?? '—'}</div><div style={{ display: 'flex', fontSize: 26, fontWeight: 800, color: '#142033' }}>{position}</div><div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', fontSize: 130, color: 'rgba(255,255,255,.86)' }}>⚡</div><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(5,12,24,.8)', margin: '-10px -26px -26px', padding: '17px 20px' }}><div style={{ display: 'flex', fontSize: 28, fontWeight: 800 }}>{name}</div><div style={{ display: 'flex', marginTop: 12, gap: 16 }}>{stats.map(([label, value]) => <div key={String(label)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><span style={{ display: 'flex', fontSize: 21, fontWeight: 800 }}>{String(value)}</span><span style={{ display: 'flex', fontSize: 10, color: 'rgba(255,255,255,.65)' }}>{String(label)}</span></div>)}</div></div></div>
      </div>
    </div>,
    size,
  )
}
