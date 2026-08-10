import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { calculateRating, type MatchResult, type PlayerPosition } from '@/lib/rating'
import { logServerError, logServerEvent } from '@/lib/monitoring'
import { checkRateLimit } from '@/lib/rate-limit'

type PerformanceInput = {
  playerRankId?: string
  teamId?: string
  goals?: number
  assists?: number
  cleanSheet?: boolean
  mvp?: boolean
  savePercentage?: number
}

type MatchResultBody = {
  mode?: 'preview' | 'confirm'
  tournamentId?: string
  teamAId?: string
  teamBId?: string
  teamAScore?: number
  teamBScore?: number
  performances?: PerformanceInput[]
}

type Profile = {
  role: 'user' | 'organizer' | 'admin'
}

type Tournament = {
  id: string
  organizer_id: string
}

type Team = {
  id: string
  name: string
  tournament_id: string
  status: string
}

type PlayerRank = {
  id: string
  player_id: string | null
  player_name: string
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

type PreviewItem = {
  playerRankId: string
  playerName: string
  teamId: string
  result: MatchResult
  ratingBefore: number
  ratingAfter: number
  ratingChange: number
  matchChange: number
  performanceBonus: number
  confidence: 'provisional' | 'active' | 'full'
  goals: number
  assists: number
  cleanSheet: boolean
  mvp: boolean
  savePercentage: number | null
}

function toNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function resultForTeam(teamScore: number, opponentScore: number): MatchResult {
  if (teamScore > opponentScore) return 'win'
  if (teamScore < opponentScore) return 'loss'
  return 'draw'
}

function averageRating(ratings: number[]) {
  if (ratings.length === 0) return 1000
  return Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length)
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, { scope: 'match-results', limit: 20, windowSeconds: 5 * 60 })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'บันทึกผลแข่งบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    )
  }

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

  const typedProfile = profile as Profile | null
  if (typedProfile?.role !== 'organizer' && typedProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์บันทึกผลแข่ง' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as MatchResultBody | null
  const teamAScore = toNumber(body?.teamAScore, -1)
  const teamBScore = toNumber(body?.teamBScore, -1)
  const performances = body?.performances ?? []

  if (!body?.tournamentId || !body.teamAId || !body.teamBId || body.teamAId === body.teamBId) {
    return NextResponse.json({ error: 'กรุณาเลือกรายการแข่งและทีมให้ถูกต้อง' }, { status: 400 })
  }

  if (teamAScore < 0 || teamBScore < 0) {
    return NextResponse.json({ error: 'คะแนนทีมต้องเป็นเลข 0 ขึ้นไป' }, { status: 400 })
  }

  if (performances.length === 0) {
    return NextResponse.json({ error: 'กรุณาเพิ่ม performance นักกีฬาอย่างน้อย 1 คน' }, { status: 400 })
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, organizer_id')
    .eq('id', body.tournamentId)
    .single()

  if (tournamentError || !tournament) {
    return NextResponse.json({ error: 'ไม่พบรายการแข่งขัน' }, { status: 404 })
  }

  const typedTournament = tournament as Tournament
  const isAdmin = typedProfile?.role === 'admin'
  if (!isAdmin && typedTournament.organizer_id !== user.id) {
    return NextResponse.json({ error: 'จัดการได้เฉพาะรายการแข่งของคุณ' }, { status: 403 })
  }

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, tournament_id, status')
    .in('id', [body.teamAId, body.teamBId])

  const typedTeams = (teams ?? []) as Team[]
  const teamA = typedTeams.find(team => team.id === body.teamAId)
  const teamB = typedTeams.find(team => team.id === body.teamBId)

  if (!teamA || !teamB || teamA.tournament_id !== body.tournamentId || teamB.tournament_id !== body.tournamentId) {
    return NextResponse.json({ error: 'ทีมที่เลือกไม่อยู่ในรายการแข่งขันนี้' }, { status: 400 })
  }

  const playerRankIds = [...new Set(performances.map(item => item.playerRankId).filter(Boolean))] as string[]
  if (playerRankIds.length !== performances.length) {
    return NextResponse.json({ error: 'นักกีฬาแต่ละคนบันทึกได้หนึ่งครั้งต่อหนึ่งผลแข่ง' }, { status: 400 })
  }
  const { data: playerRanks } = await supabase
    .from('player_ranks')
    .select('id, player_id, player_name, sport, season, position, pts')
    .in('id', playerRankIds.length > 0 ? playerRankIds : ['none'])

  const typedPlayerRanks = (playerRanks ?? []) as PlayerRank[]
  if (typedPlayerRanks.length !== playerRankIds.length) {
    return NextResponse.json({ error: 'พบนักกีฬาบางคนที่ไม่มีในระบบ ranking' }, { status: 400 })
  }

  const ratingRows: PlayerRating[] = []
  for (const playerRank of typedPlayerRanks) {
    const sport = playerRank.sport
    const { data: existingRating } = await supabase
      .from('player_ratings')
      .select('*')
      .eq('player_rank_id', playerRank.id)
      .eq('sport', sport)
      .eq('season', playerRank.season)
      .maybeSingle()

    if (existingRating) {
      ratingRows.push(existingRating as PlayerRating)
      continue
    }

    const { data: createdRating, error: createRatingError } = await supabase
      .from('player_ratings')
      .insert({
        player_id: playerRank.player_id,
        player_rank_id: playerRank.id,
        sport,
        season: playerRank.season,
        power_rating: playerRank.pts ?? 1000,
      })
      .select('*')
      .single()

    if (createRatingError || !createdRating) {
      return NextResponse.json({ error: createRatingError?.message ?? 'สร้าง Rating record ไม่สำเร็จ' }, { status: 400 })
    }

    ratingRows.push(createdRating as PlayerRating)
  }

  const ratingByPlayerRank = new Map<string, PlayerRating>()
  typedPlayerRanks.forEach((playerRank, index) => ratingByPlayerRank.set(playerRank.id, ratingRows[index]))

  const teamARatings = performances
    .filter(item => item.teamId === body.teamAId && item.playerRankId)
    .map(item => ratingByPlayerRank.get(item.playerRankId!)?.power_rating ?? 1000)
  const teamBRatings = performances
    .filter(item => item.teamId === body.teamBId && item.playerRankId)
    .map(item => ratingByPlayerRank.get(item.playerRankId!)?.power_rating ?? 1000)
  const teamAAverageRating = averageRating(teamARatings)
  const teamBAverageRating = averageRating(teamBRatings)
  const preview: PreviewItem[] = []

  for (const item of performances) {
    const playerRank = typedPlayerRanks.find(rank => rank.id === item.playerRankId)
    if (!playerRank || (item.teamId !== body.teamAId && item.teamId !== body.teamBId)) {
      return NextResponse.json({ error: 'ข้อมูล performance ไม่ถูกต้อง' }, { status: 400 })
    }

    const rating = ratingByPlayerRank.get(playerRank.id)
    if (!rating) {
      return NextResponse.json({ error: 'ไม่พบ Rating record ของนักกีฬา' }, { status: 400 })
    }

    const isTeamA = item.teamId === body.teamAId
    const teamResult = isTeamA
      ? resultForTeam(teamAScore, teamBScore)
      : resultForTeam(teamBScore, teamAScore)
    const opponentRating = isTeamA ? teamBAverageRating : teamAAverageRating
    const goals = toNumber(item.goals)
    const assists = toNumber(item.assists)
    const cleanSheet = item.cleanSheet === true
    const mvp = item.mvp === true
    const ratingResult = calculateRating({
      currentRating: rating.power_rating,
      opponentRating,
      result: teamResult,
      position: playerRank.position,
      matchesPlayed: rating.matches_played,
      goals,
      assists,
      cleanSheet,
      mvp,
      savePercentage: item.savePercentage,
    })

    preview.push({
      playerRankId: playerRank.id,
      playerName: playerRank.player_name,
      teamId: item.teamId,
      result: teamResult,
      ratingBefore: rating.power_rating,
      ratingAfter: ratingResult.nextRating,
      ratingChange: ratingResult.ratingChange,
      matchChange: ratingResult.matchChange,
      performanceBonus: ratingResult.performanceBonus,
      confidence: ratingResult.confidence,
      goals,
      assists,
      cleanSheet,
      mvp,
      savePercentage: item.savePercentage ?? null,
    })
  }

  if (body.mode !== 'confirm') {
    return NextResponse.json({
      ok: true,
      mode: 'preview',
      teams: {
        a: { id: teamA.id, name: teamA.name, score: teamAScore, averageRating: teamAAverageRating },
        b: { id: teamB.id, name: teamB.name, score: teamBScore, averageRating: teamBAverageRating },
      },
      preview,
    })
  }

  const payload = preview.map(item => ({
    ...item,
    opponentRating: item.teamId === body.teamAId ? teamBAverageRating : teamAAverageRating,
  }))
  const { data: matchResultId, error: matchResultError } = await supabase.rpc('record_match_result_safely', {
    p_tournament_id: body.tournamentId,
    p_team_a_id: body.teamAId,
    p_team_b_id: body.teamBId,
    p_team_a_score: teamAScore,
    p_team_b_score: teamBScore,
    p_performances: payload,
  })

  if (matchResultError || !matchResultId) {
    logServerError({
      event: 'match_result_create_failed',
      userId: user.id,
      route: '/api/match-results',
      metadata: { tournamentId: body.tournamentId, teamAId: body.teamAId, teamBId: body.teamBId, code: matchResultError?.code },
      error: matchResultError,
    })
    const isConflict = matchResultError?.message.includes('RATING_CHANGED') || matchResultError?.code === '40001'
    return NextResponse.json(
      { error: isConflict ? 'คะแนนนักกีฬาถูกอัปเดตโดยรายการอื่น กรุณากดคำนวณใหม่แล้วบันทึกอีกครั้ง' : 'บันทึกผลแข่งไม่สำเร็จ' },
      { status: isConflict ? 409 : 400 },
    )
  }

  logServerEvent({
    event: 'match_result_confirmed',
    userId: user.id,
    route: '/api/match-results',
    metadata: { matchResultId, tournamentId: body.tournamentId, performanceCount: preview.length },
  })

  return NextResponse.json({ ok: true, mode: 'confirm', matchResultId, preview })
}
