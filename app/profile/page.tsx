import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import {
  BadgeCheck, Building2, Camera, Check, ChevronRight, Compass, Crown, Eye, EyeOff, Handshake, LayoutDashboard, Lock, LogOut,
  IdCard, MapPin, PencilLine, Route, Shield, ShieldCheck, Star, Trophy, UsersRound, Zap, type LucideIcon,
} from 'lucide-react'
import PublicProfileShare from './PublicProfileShare'
import DeleteMyDataSection from './DeleteMyDataSection'
import GuardianInviteButton from './GuardianInviteButton'
import TrainingCard from './TrainingCard'
import PageHeader from '@/components/PageHeader'
import RoleHomeCard, { RoleLoadFailed } from '@/components/RoleHomeCard'
import { calculateLevel, identityTierKey, levelProgress } from '@/lib/digital-identity'
import { ACTIVE_SEASON, ACTIVE_SPORT } from '@/lib/season'
import { PROFILE_MENU } from '@/lib/site-nav'
import { PUBLIC_PROFILE_COLUMNS, fetchMyAthletePrivate, shownAge, thaiDate } from '@/lib/athlete-private'
import { profileReadiness, type ReadinessItem } from '@/lib/profile-readiness'
import { signAvatarUrls } from '@/lib/athlete-avatar'
import { fetchMyTraining } from '@/lib/training/data'
import { trainingHasPrimary, trainingHome } from '@/lib/training/home'
import { homeKind, type HomeKind } from '@/lib/role-home'
import { loadRoleHome } from '@/lib/role-home-data'
import type messagesTh from '@/messages/th.json'
import './profile.css'

// /profile is "ของฉัน": it opens on the person's own work for their role (lib/role-home.ts)
// with one primary button. For an athlete that is training first, then what is left before
// their profile can go public, their card and their teams; for a guardian, coach, organizer or
// venue owner it is their own list. Editing lives on /profile/edit, so this page reads at a glance.

type Profile = { full_name?: string | null; role?: string | null; onboarding_persona?: string | null }
type AthleteProfile = {
  display_name: string
  position?: string | null
  province?: string | null
  current_team?: string | null
  profile_image_url?: string | null
  is_public: boolean
  verification_level: 'self' | 'coach_verified' | 'performance_verified'
}
type PlayerRank = { id: string; player_name: string; position: string; ovr: number; pts: number }
type Membership = {
  status: 'pending' | 'accepted' | 'declined' | 'removed'
  teams: { id: string; name: string; status: string; tournaments: { name: string | null; location: string | null }[] | { name: string | null; location: string | null } | null } | null
}
type ShortcutKey = keyof (typeof messagesTh)['profileHome']['shortcuts']['items']
type TeamStatus = keyof (typeof messagesTh)['profileHome']['teams']['status']
type Shortcut = { key: ShortcutKey; href: string; icon: LucideIcon }

const MENU_KEYS: Record<(typeof PROFILE_MENU)[number]['href'], { key: ShortcutKey; icon: LucideIcon }> = {
  '/venues': { key: 'venues', icon: Building2 },
  '/sponsorships': { key: 'sponsorships', icon: Handshake },
  '/team-members': { key: 'teamMembers', icon: UsersRound },
  '/career': { key: 'career', icon: Route },
}

function PositionMark({ position, size }: { position: string; size: number }) {
  if (position === 'GK' || position === 'DF') return <Shield size={size} strokeWidth={1.5} />
  if (position === 'MF') return <Zap size={size} strokeWidth={1.5} />
  return <Star size={size} strokeWidth={1.5} />
}

const KIND_ICONS: Record<HomeKind, LucideIcon> = { athlete: IdCard, guardian: UsersRound, coach: Compass, organizer: Trophy, venue: Building2, sponsor: Handshake }
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => [...part][0] ?? '').join('').toUpperCase() || '?'
const count = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
  const { count: value, error } = await query
  return error ? 0 : value ?? 0
}

export default async function ProfilePage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: cookiesToSet => cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const t = await getTranslations('profileHome')
  const { data: profileRow } = await supabase.from('profiles').select('full_name, role, onboarding_persona').eq('id', user.id).maybeSingle()
  const profile = profileRow as Profile | null
  const today = thaiDate(new Date())
  const kind = homeKind({ persona: profile?.onboarding_persona, role: profile?.role })
  const athleteHome = kind === 'athlete'
  // A guardian, coach, organizer or venue owner is not shown, or charged for, the athlete's queries.
  const [athleteResult, rankResult, membershipResult, progressResult, highlightCount, videoCount, pendingGuardian] = athleteHome ? await Promise.all([
    supabase.from('athlete_profiles').select(PUBLIC_PROFILE_COLUMNS).eq('user_id', user.id).maybeSingle(),
    supabase.from('player_ranks').select('id, player_name, position, ovr, pts').eq('player_id', user.id).eq('sport', ACTIVE_SPORT).eq('season', ACTIVE_SEASON).maybeSingle(),
    supabase.from('team_members').select('status, teams(id, name, status, tournaments(name, location))').eq('athlete_id', user.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('athlete_progress').select('xp_total, current_level').eq('athlete_id', user.id).maybeSingle(),
    count(supabase.from('athlete_highlights').select('id', { count: 'exact', head: true }).eq('athlete_id', user.id)),
    count(supabase.from('athlete_videos').select('id', { count: 'exact', head: true }).eq('athlete_id', user.id)),
    count(supabase.from('guardian_links').select('id', { count: 'exact', head: true }).eq('athlete_id', user.id).eq('status', 'pending')),
  ]) : [null, null, null, null, 0, 0, 0] as const
  const athleteRow = athleteResult?.data ?? null
  const rankRow = rankResult?.data ?? null
  const membershipRows = membershipResult?.data ?? null
  const progressRow = progressResult?.data ?? null
  const roleKind = athleteHome ? null : kind
  const [loaded, hasAthleteProfile] = roleKind ? await Promise.all([
    loadRoleHome(supabase, roleKind, user.id),
    // Someone who coaches or runs a venue may also play: their card stays one tap away.
    count(supabase.from('athlete_profiles').select('user_id', { count: 'exact', head: true }).eq('user_id', user.id)),
  ]) : [null, 0] as const
  const athlete = athleteRow as AthleteProfile | null
  const rank = rankRow as PlayerRank | null
  const memberships = (membershipRows ?? []) as unknown as Membership[]
  // The birth date and consent time come only through my_athlete_private (sql/58).
  const [athletePrivate, avatarUrls, training] = await Promise.all([
    athlete ? fetchMyAthletePrivate(supabase, user.id).catch(error => {
      console.error(JSON.stringify({ level: 'error', event: 'athlete_private_read_failed', code: error?.code ?? null }))
      return { birth_date: null, guardian_consent_at: null }
    }) : null,
    // The photo is a private object (T51); the owner may always sign their own.
    signAvatarUrls(supabase, [athlete?.profile_image_url]),
    // Training (sql/63) is the athlete's own; nothing to show without an athlete profile.
    athlete ? fetchMyTraining(supabase, user.id) : null,
  ])
  const avatarUrl = athlete?.profile_image_url ? avatarUrls.get(athlete.profile_image_url) ?? null : null

  const progress = progressRow as { xp_total: number; current_level: number } | null
  const xp = progress?.xp_total ?? 0
  const level = progress?.current_level ?? calculateLevel(xp)
  const levelInfo = levelProgress(xp, level)
  const readiness = athlete ? profileReadiness({
    displayName: athlete.display_name,
    birthDate: athletePrivate?.birth_date,
    photo: athlete.profile_image_url,
    position: athlete.position,
    team: athlete.current_team,
    guardianConsentAt: athletePrivate?.guardian_consent_at,
    mediaCount: highlightCount + videoCount,
    isPublic: athlete.is_public,
    pendingGuardianRequests: pendingGuardian,
  }, today) : null

  // Shown and used for the training suggestion only when it can be right (5-80); the consent rule
  // in readiness still uses the real value.
  const age = shownAge(readiness?.age ?? null)
  // What the training card asks for, and so whether it holds this page's one primary button.
  const trainingCard = trainingHome(training ?? { available: false, enrollments: [], checkins: {} }, today, age)
  const trainingPrimary = trainingHasPrimary(trainingCard)
  const name = athlete?.display_name?.trim() || profile?.full_name?.trim() || (athleteHome ? t('noName') : user.email ?? t('noName'))
  const publicPath = `/players/${rank?.id || user.id}`
  const rt = await getTranslations('roleHome')
  // The organizer dashboard is for whoever an admin made an organizer, and only them: a coach
  // is never offered a page that tells them they have no access.
  const organizes = profile?.role === 'organizer' || profile?.role === 'admin'
  const roleShortcuts: Shortcut[] = [
    ...(profile?.role === 'admin' ? [{ key: 'admin' as const, href: '/admin', icon: ShieldCheck }] : []),
    ...(organizes && kind !== 'organizer' ? [{ key: 'dashboard' as const, href: '/dashboard', icon: LayoutDashboard }] : []),
    ...(roleKind && hasAthleteProfile > 0 ? [{ key: 'card' as const, href: '/card', icon: IdCard }] : []),
  ]
  const shortcuts: Shortcut[] = [...roleShortcuts, ...PROFILE_MENU.map(item => ({ ...MENU_KEYS[item.href], href: item.href }))]

  // Done and next say so; any other open step is just a link; a locked one explains itself in place of its hint.
  const stepTag = (item: ReadinessItem) => item.done ? t('readiness.statusDone') : item.key === readiness?.next?.key ? t('readiness.next') : item.blocked ? '' : <span className="pf-sr">{t('readiness.statusTodo')}</span>

  return (
    <main className="pf">
      <PageHeader eyebrow={t('eyebrow')} />
      <div className="pf-shell">
        <aside className="pf-aside">
          {!athleteHome ? <section className="pf-hero" aria-labelledby="pf-name">
            <div className="pf-id">
              {/* An icon, not the first letter: a Thai name can start with a vowel mark that is no one's initial. */}
              <div className="pf-avatar" aria-hidden="true">{(() => { const Icon = KIND_ICONS[kind]; return <Icon size={30} /> })()}</div>
              <div style={{ minWidth: 0 }}>
                <h1 id="pf-name" className="pf-name">{name}</h1>
                <div className="pf-sub">{rt('as', { role: rt(`roles.${kind}`) })}</div>
              </div>
            </div>
          </section> : <section className="pf-hero" aria-labelledby="pf-name">
            <div className="pf-id">
              <div className="pf-avatar" style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined} aria-hidden="true">
                {!avatarUrl && initials(name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <h1 id="pf-name" className="pf-name">{name}</h1>
                {athlete && <div className="pf-sub">{[athlete.current_team, athlete.province].filter(Boolean).join(' · ') || ' '}</div>}
              </div>
            </div>
            {athlete && <div className="pf-chips">
              {athlete.position && <span className="pf-chip is-gold">{athlete.position}</span>}
              {age !== null && <span className="pf-chip">{t('age', { age })}</span>}
              <span className={`pf-chip${athlete.verification_level !== 'self' ? ' is-green' : ''}`}>
                {athlete.verification_level !== 'self' && <BadgeCheck size={13} aria-hidden="true" />}{t(`verification.${athlete.verification_level}`)}
              </span>
              <span className="pf-chip">{athlete.is_public ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}{t(athlete.is_public ? 'visibility.public' : 'visibility.private')}</span>
            </div>}
            {/* Level and points mean nothing before the first point, so they stay out of sight until then. */}
            {athlete && xp > 0 && <div className="pf-level">
              <div className="pf-level-num"><small>{t('levelLabel')}</small><b>{String(level).padStart(2, '0')}</b></div>
              <div className="pf-level-body">
                <strong>{t(`tiers.${identityTierKey(level)}`)}</strong>
                <div className="pf-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(levelInfo.percentage)} aria-label={t('level', { level })}><i style={{ width: `${levelInfo.percentage}%` }} /></div>
                <small>{t('xpToNext', { xp: xp.toLocaleString(), remaining: levelInfo.remaining.toLocaleString(), next: level + 1 })}</small>
              </div>
            </div>}
            <div className="pf-actions">
              {/* Editing is secondary: the one primary button on this page is the next thing to do. */}
              <Link href="/profile/edit" className="pf-btn pf-btn-ghost"><PencilLine size={17} aria-hidden="true" />{athlete ? t('actions.edit') : t('noAthlete.cta')}</Link>
              {athlete?.is_public
                ? <Link href={publicPath} className="pf-btn pf-btn-ghost"><Eye size={17} aria-hidden="true" />{t('actions.viewPublic')}</Link>
                : athlete && <Link href="/career" className="pf-btn pf-btn-ghost"><Route size={17} aria-hidden="true" />{t('actions.passport')}</Link>}
            </div>
          </section>}
        </aside>

        <div className="pf-main">
          {roleKind && (loaded ? <RoleHomeCard kind={roleKind} home={loaded.home} stats={loaded.stats} /> : <RoleLoadFailed />)}

          {athleteHome && <>
          {!athlete && <section className="pf-card">
            <div className="pf-card-head"><div><h2 className="pf-card-title">{t('noAthlete.title')}</h2><p className="pf-card-desc">{t('noAthlete.body')}</p></div></div>
            <Link href="/profile/edit" className="pf-btn pf-btn-primary"><Camera size={17} aria-hidden="true" />{t('noAthlete.cta')}</Link>
          </section>}

          {/* Training comes first (owner, report 9): today's session, or the programme to pick for their age. */}
          <TrainingCard home={trainingCard} age={age} />

          {readiness && (athlete?.is_public && readiness.next ? <Link href={readiness.next.href} className="pf-card pf-ready-line">
            <span>{t('readiness.compact', { done: readiness.done, total: readiness.total, next: t(`readiness.items.${readiness.next.key}.title`) })}</span>
            <ChevronRight size={17} aria-hidden="true" />
          </Link> : readiness.next || !athlete?.is_public ? <section className="pf-card pf-next-card" aria-labelledby="pf-readiness">
            <div className="pf-card-head">
              <h2 id="pf-readiness" className="pf-card-title">{t('readiness.title')}</h2>
              <span className="pf-card-meta">{t('readiness.progress', { done: readiness.done, total: readiness.total })}</span>
            </div>
            <div className="pf-segments" aria-hidden="true">{readiness.items.map(item => <i key={item.key} className={item.done ? 'is-done' : item.key === readiness.next?.key ? 'is-now' : undefined} />)}</div>
            {/* One thing to do now, in full; every step stays listed below. */}
            {readiness.next && <div className="pf-next">
              <span className="ui-chip is-red">{t('readiness.next')}</span>
              <b className="pf-next-title">{t(`readiness.items.${readiness.next.key}.title`)}</b>
              <p className="pf-next-hint">{t(`readiness.items.${readiness.next.key}.hint`)}</p>
              {readiness.next.pending ? <p className="pf-step-pending">{t('readiness.pending', { count: readiness.next.pending })}</p> : null}
              {readiness.next.key === 'guardian' && !readiness.next.pending
                ? <GuardianInviteButton email={user.email ?? ''} />
                : <Link href={readiness.next.href} className={`pf-btn pf-btn-block ${trainingPrimary ? 'pf-btn-line' : 'pf-btn-primary'}`}>{t('readiness.cta')}<ChevronRight size={17} aria-hidden="true" /></Link>}
            </div>}
            <details className="pf-all-steps" open={!readiness.next}>
              <summary>{t('readiness.showAll')}</summary>
              <ol className="pf-steps">
                {readiness.items.map(item => {
                  const state = item.done ? ' is-done' : item.blocked ? ' is-blocked' : item.key === readiness.next?.key ? ' is-next' : ''
                  const body = <>
                    <span className="pf-step-icon" aria-hidden="true">{item.done ? <Check size={16} strokeWidth={3} /> : item.blocked ? <Lock size={13} /> : null}</span>
                    <span>
                      <span className="pf-step-title">{t(`readiness.items.${item.key}.title`)}</span>
                      {!item.done && <span className="pf-step-hint">{item.blocked ? t('readiness.blocked') : t(`readiness.items.${item.key}.hint`)}</span>}
                      {!item.done && item.pending ? <span className="pf-step-pending">{t('readiness.pending', { count: item.pending })}</span> : null}
                    </span>
                    <span className="pf-step-tag">{stepTag(item)}{!item.done && !item.blocked && <ChevronRight size={15} aria-hidden="true" style={{ verticalAlign: '-3px' }} />}</span>
                  </>
                  return <li key={item.key} className={`pf-step${state}`}>{item.done || item.blocked ? <div>{body}</div> : <Link href={item.href}>{body}</Link>}</li>
                })}
              </ol>
            </details>
          </section> : <section className="pf-card" aria-labelledby="pf-readiness">
            <div className="pf-card-head"><h2 id="pf-readiness" className="pf-card-title">{t('readiness.titleDone')}</h2></div>
            <p className="pf-ready"><BadgeCheck size={20} aria-hidden="true" />{t('readiness.doneNote')}</p>
          </section>)}

          {athlete?.is_public && <PublicProfileShare profilePath={publicPath} isPublic />}

          {athlete && <section className="pf-card" aria-labelledby="pf-card">
            <div className="pf-card-head"><h2 id="pf-card" className="pf-card-title">{t('card.title')}</h2></div>
            <div className="pf-player">
              {rank ? <div className="pf-fut">
                <div className="pf-fut-top"><b>{rank.ovr}</b><span>{rank.position}</span></div>
                <div className="pf-fut-mark"><PositionMark position={rank.position} size={46} /></div>
                <div className="pf-fut-name">{rank.player_name}</div>
              </div> : <div className="pf-fut is-starter">
                <div className="pf-fut-top"><b>—</b><span>{athlete.position || 'FW'}</span></div>
                <div className="pf-fut-mark"><PositionMark position={athlete.position || 'FW'} size={46} /></div>
                <div className="pf-fut-name">{name}</div>
              </div>}
              <div style={{ minWidth: 0 }}>
                {rank
                  ? <><div className="pf-power">{rank.pts.toLocaleString()}<small>{t('card.power')}</small></div><p className="pf-note">{t('card.source')}</p></>
                  : <><div className="pf-power" style={{ fontSize: 22 }}>{t('card.starterTitle')}</div><p className="pf-note">{t('card.starterBody')}</p></>}
                <div className="pf-row">
                  <Link href="/card" className="pf-btn pf-btn-line pf-btn-sm">{t('card.build')}</Link>
                  {rank && <Link href="/ranking" className="pf-btn pf-btn-line pf-btn-sm">{t('card.myRanking')}</Link>}
                  {!rank && <Link href="/tournaments" className="pf-btn pf-btn-line pf-btn-sm"><Crown size={15} aria-hidden="true" />{t('card.findTournament')}</Link>}
                </div>
              </div>
            </div>
          </section>}

          {memberships.length > 0 && <section className="pf-card" aria-labelledby="pf-teams">
            <div className="pf-card-head">
              <h2 id="pf-teams" className="pf-card-title">{t('teams.title')}</h2>
              <Link href="/team-members" className="pf-card-meta tap-44" style={{ textDecoration: 'none' }}>{t('teams.viewAll')}</Link>
            </div>
            <ul className="pf-list">
              {memberships.map((membership, index) => {
                const team = membership.teams
                const tournament = Array.isArray(team?.tournaments) ? team?.tournaments[0] : team?.tournaments
                const accepted = membership.status === 'accepted'
                const [status, tone]: [TeamStatus, string] = !accepted
                  ? membership.status === 'pending' ? ['invited', 'is-wait'] : ['declined', 'is-muted']
                  : team?.status === 'confirmed' ? ['confirmed', 'is-ok'] : team?.status === 'pending' ? ['teamPending', 'is-wait'] : ['forming', 'is-muted']
                return <li key={`${team?.id ?? 'team'}-${index}`}>
                  <div className="pf-list-main">
                    <b>{team?.name ?? t('teams.unnamed')}</b>
                    <span>{tournament?.name ?? t('teams.tournament')}{tournament?.location ? <> · <MapPin size={11} aria-hidden="true" style={{ verticalAlign: '-1px' }} /> {tournament.location}</> : null}</span>
                  </div>
                  <span className={`pf-badge ${tone}`}>{t(`teams.status.${status}`)}</span>
                </li>
              })}
            </ul>
          </section>}

          </>}

          <section aria-labelledby="pf-shortcuts">
            <h2 id="pf-shortcuts" className="pf-card-title" style={{ marginBottom: 14 }}>{t('shortcuts.title')}</h2>
            <div className="pf-links">
              {shortcuts.map(item => {
                const Icon = item.icon
                return <Link key={item.href} href={item.href} className="pf-link">
                  <span className="pf-link-icon"><Icon size={19} aria-hidden="true" /></span>
                  <span style={{ minWidth: 0 }}><b>{t(`shortcuts.items.${item.key}.label`)}</b><small>{t(`shortcuts.items.${item.key}.hint`)}</small></span>
                  <ChevronRight size={17} color="#9aa1ab" aria-hidden="true" />
                </Link>
              })}
            </div>
          </section>

          <section className="pf-card" aria-labelledby="pf-account">
            <div className="pf-card-head"><h2 id="pf-account" className="pf-card-title">{t('account.title')}</h2></div>
            <div className="pf-account">
              <div style={{ minWidth: 0 }}><small>{t('account.signedInAs')}</small><b>{user.email}</b></div>
              <form action="/auth/signout" method="POST">
                <button type="submit" className="pf-btn pf-btn-line pf-btn-sm"><LogOut size={15} aria-hidden="true" />{t('account.signOut')}</button>
              </form>
            </div>
          </section>

          <DeleteMyDataSection />
        </div>
      </div>
    </main>
  )
}
