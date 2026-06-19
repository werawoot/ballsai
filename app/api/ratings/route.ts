import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { calculateRating, ratingToOverall, type MatchResult, type PlayerPosition } from '@/lib/rating'

type RatingBody = {
  playerRankId?: string
  sport?: string
  result?: MatchResult
  opponentRating?: number
  goals?: number
  assists?: number
  cleanSheet?: boolean
  mvp?: boolean
  savePercentage?: number
}

type PlayerRank = {
  id: string
  player_id: string | null
  sport: string
  season: string
  position: PlayerPosition
  pts: number | null
}

type PlayerRating = {
  id: string
  power_rating: number
  matches_played: number
  wins: number
  draws: number
  losses: number
  goals: number
  assists: number
  clean_sheets: number
  mvps: number
}

function isMatchResult(result: unknown): result is MatchResult {
  return result === 'win' || result === 'draw' || result === 'loss'
}

function toNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'เฉพาะ admin เท่านั้นที่บันทึก Rating ได้' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as RatingBody | null
  if (!body?.playerRankId || !isMatchResult(body.result)) {
    return NextResponse.json({ error: 'กรุณาระบุ playerRankId และ result ให้ถูกต้อง' }, { status: 400 })
  }

  const { data: playerRank, error: playerRankError } = await supabase
    .from('player_ranks')
    .select('id, player_id, sport, season, position, pts')
    .eq('id', body.playerRankId)
    .single()

  if (playerRankError || !playerRank) {
    return NextResponse.json({ error: 'ไม่พบนักกีฬาที่ต้องการอัปเดต Rating' }, { status: 404 })
  }

  const typedPlayerRank = playerRank as PlayerRank
  const sport = body.sport ?? typedPlayerRank.sport

  const { data: existingRating } = await supabase
    .from('player_ratings')
    .select('*')
    .eq('player_rank_id', typedPlayerRank.id)
    .eq('sport', sport)
    .eq('season', typedPlayerRank.season)
    .maybeSingle()

  let rating = existingRating as PlayerRating | null

  if (!rating) {
    const { data: createdRating, error: createRatingError } = await supabase
      .from('player_ratings')
      .insert({
        player_id: typedPlayerRank.player_id,
        player_rank_id: typedPlayerRank.id,
        sport,
        season: typedPlayerRank.season,
        power_rating: typedPlayerRank.pts ?? 1000,
      })
      .select('*')
      .single()

    if (createRatingError || !createdRating) {
      return NextResponse.json({ error: createRatingError?.message ?? 'สร้าง Rating record ไม่สำเร็จ' }, { status: 400 })
    }

    rating = createdRating as PlayerRating
  }

  const goals = toNumber(body.goals)
  const assists = toNumber(body.assists)
  const cleanSheet = body.cleanSheet === true
  const mvp = body.mvp === true
  const result = calculateRating({
    currentRating: rating.power_rating,
    opponentRating: toNumber(body.opponentRating, 1000),
    result: body.result,
    position: typedPlayerRank.position,
    matchesPlayed: rating.matches_played,
    goals,
    assists,
    cleanSheet,
    mvp,
    savePercentage: body.savePercentage,
  })

  const { error: updateRatingError } = await supabase
    .from('player_ratings')
    .update({
      power_rating: result.nextRating,
      matches_played: rating.matches_played + 1,
      wins: rating.wins + (body.result === 'win' ? 1 : 0),
      draws: rating.draws + (body.result === 'draw' ? 1 : 0),
      losses: rating.losses + (body.result === 'loss' ? 1 : 0),
      goals: rating.goals + goals,
      assists: rating.assists + assists,
      clean_sheets: rating.clean_sheets + (cleanSheet ? 1 : 0),
      mvps: rating.mvps + (mvp ? 1 : 0),
      last_rating_change: result.ratingChange,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rating.id)

  if (updateRatingError) {
    return NextResponse.json({ error: updateRatingError.message }, { status: 400 })
  }

  const { error: updateRankError } = await supabase
    .from('player_ranks')
    .update({
      pts: result.nextRating,
      ovr: ratingToOverall(result.nextRating),
      rank_change: result.ratingChange,
    })
    .eq('id', typedPlayerRank.id)

  if (updateRankError) {
    return NextResponse.json({ error: updateRankError.message }, { status: 400 })
  }

  const { error: eventError } = await supabase.from('rating_events').insert({
    player_rating_id: rating.id,
    sport,
    result: body.result,
    opponent_rating: toNumber(body.opponentRating, 1000),
    rating_before: rating.power_rating,
    rating_after: result.nextRating,
    rating_change: result.ratingChange,
    match_change: result.matchChange,
    performance_bonus: result.performanceBonus,
    goals,
    assists,
    clean_sheet: cleanSheet,
    mvp,
    save_percentage: body.savePercentage ?? null,
    created_by: user.id,
  })

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, ...result })
}
