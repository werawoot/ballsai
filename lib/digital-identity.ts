export type IdentityBadgeKey =
  | 'rookie'
  | 'first_match'
  | 'first_win'
  | 'goal_hunter'
  | 'playmaker'
  | 'clean_sheet'
  | 'match_mvp'
  | 'road_warrior'
  | 'rising_star'

export type IdentityStats = {
  hasProfile?: boolean
  matchesPlayed?: number
  wins?: number
  goals?: number
  assists?: number
  cleanSheets?: number
  mvps?: number
  powerRating?: number
}

export const IDENTITY_BADGES: Array<{
  key: IdentityBadgeKey
  name: string
  thaiName: string
  description: string
  xp: number
}> = [
  { key: 'rookie', name: 'ROOKIE', thaiName: 'เริ่มต้นเส้นทาง', description: 'สร้าง Athlete Identity ของตัวเอง', xp: 50 },
  { key: 'first_match', name: 'FIRST KICK', thaiName: 'นัดแรก', description: 'มีผลการแข่งขันครั้งแรกในระบบ', xp: 30 },
  { key: 'first_win', name: 'WINNER', thaiName: 'ชัยชนะแรก', description: 'ชนะการแข่งขันครั้งแรก', xp: 20 },
  { key: 'goal_hunter', name: 'GOAL HUNTER', thaiName: 'ประตูแรก', description: 'ทำประตูแรกในระบบ', xp: 10 },
  { key: 'playmaker', name: 'PLAYMAKER', thaiName: 'แอสซิสต์แรก', description: 'ทำแอสซิสต์แรกในระบบ', xp: 8 },
  { key: 'clean_sheet', name: 'THE WALL', thaiName: 'คลีนชีตแรก', description: 'เก็บคลีนชีตแรกของคุณ', xp: 15 },
  { key: 'match_mvp', name: 'MATCH MVP', thaiName: 'MVP นัดแรก', description: 'ได้รับเลือกเป็น MVP', xp: 35 },
  { key: 'road_warrior', name: 'ROAD WARRIOR', thaiName: 'นักสู้ 10 นัด', description: 'ลงเล่นครบ 10 นัด', xp: 80 },
  { key: 'rising_star', name: 'RISING STAR', thaiName: 'ดาวรุ่ง', description: 'Power Rating ถึง 1,500', xp: 100 },
]

export function calculateLevel(xp: number) {
  return Math.max(1, Math.min(99, 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 100))))
}

export function levelProgress(xp: number, level = calculateLevel(xp)) {
  const currentFloor = Math.pow(level - 1, 2) * 100
  const nextFloor = Math.pow(level, 2) * 100
  return {
    currentFloor,
    nextFloor,
    remaining: Math.max(0, nextFloor - xp),
    percentage: Math.min(100, Math.max(0, ((xp - currentFloor) / (nextFloor - currentFloor)) * 100)),
  }
}

export function unlockedBadgeKeys(stats: IdentityStats): IdentityBadgeKey[] {
  const matches = stats.matchesPlayed ?? 0
  const wins = stats.wins ?? 0
  const goals = stats.goals ?? 0
  const assists = stats.assists ?? 0
  const cleanSheets = stats.cleanSheets ?? 0
  const mvps = stats.mvps ?? 0
  const rating = stats.powerRating ?? 0

  return IDENTITY_BADGES.filter(badge => {
    if (badge.key === 'rookie') return Boolean(stats.hasProfile)
    if (badge.key === 'first_match') return matches >= 1
    if (badge.key === 'first_win') return wins >= 1
    if (badge.key === 'goal_hunter') return goals >= 1
    if (badge.key === 'playmaker') return assists >= 1
    if (badge.key === 'clean_sheet') return cleanSheets >= 1
    if (badge.key === 'match_mvp') return mvps >= 1
    if (badge.key === 'road_warrior') return matches >= 10
    return rating >= 1500
  }).map(badge => badge.key)
}

export function identityTitle(level: number) {
  if (level >= 12) return 'สนามพิสูจน์ตำนาน'
  if (level >= 8) return 'ตัวจริงของทีม'
  if (level >= 5) return 'ดาวรุ่งกำลังมา'
  if (level >= 2) return 'นักเตะกำลังเติบโต'
  return 'เริ่มต้นเส้นทาง'
}
