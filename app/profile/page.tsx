import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import {
  Building2, Camera, Check, ChevronRight, Compass, Handshake, LayoutDashboard, Lock, LogOut,
  IdCard, Route, ShieldCheck, Trophy, UsersRound, type LucideIcon,
} from 'lucide-react'
import DeleteMyDataSection from './DeleteMyDataSection'
import GuardianInviteButton from './GuardianInviteButton'
import TrainingCard from './TrainingCard'
import { CardOverview, HomeHero, MissionsCard, NextTraining, Opportunity, WeekProgress, type HomeTournament } from './AthleteHome'
import PageHeader from '@/components/PageHeader'
import RoleHomeCard, { RoleLoadFailed } from '@/components/RoleHomeCard'
import { countTrainingCheckins } from '@/lib/training/progress-data'
import { trainingLevel } from '@/lib/training/level'
import { PROFILE_MENU } from '@/lib/site-nav'
import { shownAge, thaiDate } from '@/lib/athlete-private'
import { profileReadiness, type ReadinessItem } from '@/lib/profile-readiness'
import { signAvatarUrls } from '@/lib/athlete-avatar'
import { fetchProfileHome } from '@/lib/profile-home'
import { recommendedProgram } from '@/lib/training/home'
import { homeKind, type HomeKind } from '@/lib/role-home'
import { loadRoleHome } from '@/lib/role-home-data'
import { EFFORT_PER_SESSION, bangkokWeekStart, dayStreak, effortSummary, lastMatchChange, nextSession, openTournamentsAhead, todayMissionList, totalMinutes, weekTotals } from '@/lib/athlete-home'
import { getPublicOpenTournaments } from '@/lib/public-data'
import { ACTIVE_SPORT } from '@/lib/season'
import { trainingToday } from '@/lib/training/today'
import { fetchUnreadNotificationCount } from '@/lib/notification-count'
import { fetchAthleteHomeExtras } from '@/lib/athlete-home-data'
import type messagesTh from '@/messages/th.json'
import { glassSceneStyle, PAGE_PHOTOS } from '@/lib/stock-photos'
import '../glass.css'
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
type ShortcutKey = keyof (typeof messagesTh)['profileHome']['shortcuts']['items']
type Shortcut = { key: ShortcutKey; href: string; icon: LucideIcon }

const MENU_KEYS: Record<(typeof PROFILE_MENU)[number]['href'], { key: ShortcutKey; icon: LucideIcon }> = {
  '/venues': { key: 'venues', icon: Building2 },
  '/sponsorships': { key: 'sponsorships', icon: Handshake },
  '/team-members': { key: 'teamMembers', icon: UsersRound },
  '/career': { key: 'career', icon: Route },
}

const KIND_ICONS: Record<HomeKind, LucideIcon> = { athlete: IdCard, guardian: UsersRound, coach: Compass, organizer: Trophy, venue: Building2, sponsor: Handshake }
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => [...part][0] ?? '').join('').toUpperCase() || '?'

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
  // One call to my_profile_home (sql/91), or the old separate reads before it is applied.
  const home = await fetchProfileHome(supabase, user.id)
  const profile = home.profile as Profile | null
  const today = thaiDate(new Date())
  const kind = homeKind({ persona: profile?.onboarding_persona, role: profile?.role })
  const athleteHome = kind === 'athlete'
  const roleKind = athleteHome ? null : kind
  // A guardian, coach, organizer or venue owner is not shown the athlete's own parts; someone
  // who coaches or runs a venue may also play, so their card stays one tap away.
  const hasAthleteProfile = home.athlete ? 1 : 0
  const [loaded, avatarUrls, extras, unread, openRows, sessionsEver] = await Promise.all([
    roleKind ? loadRoleHome(supabase, roleKind, user.id) : null,
    // The photo is a private object (T51); the owner may always sign their own.
    signAvatarUrls(supabase, [athleteHome ? (home.athlete?.profile_image_url as string | null | undefined) : null]),
    // The card's skills, the last match's change and this week's XP: small indexed reads.
    athleteHome && home.athlete ? fetchAthleteHomeExtras(supabase, user.id, bangkokWeekStart(today)) : null,
    // The bell on the athlete's home: a head count, no notification row is read.
    athleteHome ? fetchUnreadNotificationCount(supabase, user.id) : null,
    // The same cached list as the home page (60 s), not a read per visit.
    athleteHome ? getPublicOpenTournaments(today) : null,
    // The training level (ADR-015): every check-in ever, as a head count.
    athleteHome && home.athlete ? countTrainingCheckins(supabase, user.id) : 0,
  ])
  const athlete = (athleteHome ? home.athlete : null) as AthleteProfile | null
  const teamInvites = athleteHome ? home.memberships.filter(membership => membership.status === 'pending').length : 0
  const inTeam = athleteHome && home.memberships.some(membership => membership.status === 'accepted')
  const rank = (athleteHome ? home.rank : null) as PlayerRank | null
  const athletePrivate = athlete ? home.private : null
  const training = athlete ? home.training : null
  const highlightCount = athleteHome ? home.highlights : 0
  const videoCount = athleteHome ? home.videos : 0
  const pendingGuardian = athleteHome ? home.pendingGuardian : 0
  const avatarUrl = athlete?.profile_image_url ? avatarUrls.get(athlete.profile_image_url) ?? null : null

  // The home shows the training level from effort points (ADR-015, owner 8 Nov 2026); the match
  // level from XP stays on the card. Nothing before the first recorded session.
  const level = sessionsEver && sessionsEver > 0 ? trainingLevel(sessionsEver * EFFORT_PER_SESSION) : null
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
  // This week across every active programme, as /training counts it (the athlete's own check-ins, SQL63).
  const built = training?.available && training.enrollments.length > 0 ? trainingToday(training, today) : null
  // An enrolment in a programme that no longer exists is no programme at all.
  const view = built && built.programs.length > 0 ? built : null
  const goal = view ? weekTotals(view) : null
  // The home of the third reference (owner, 3 Nov 2026): missions worth effort points (never XP),
  // the next session, minutes and days in a row; all of it the athlete's own check-ins (SQL63).
  const missions = view ? todayMissionList(view) : []
  const effort = view ? effortSummary(view) : null
  const firstOpen = missions.find(item => !item.done)?.programId ?? null
  const next = view ? nextSession(view) : null
  const opportunity = openTournamentsAhead((openRows ?? []) as HomeTournament[], today)[0] ?? null
  // Programmes with no session today and none to come (finished): pick the next one, as the primary.
  const finished = Boolean(view && view.plannedToday === 0 && !next)
  const pickProgramme = Boolean(athlete && training?.available && (!view || finished))
  // The training part holds the one primary button: picking a programme, or today's first open mission.
  const trainingPrimary = pickProgramme || Boolean(firstOpen)
  const matchChange = lastMatchChange(extras?.rating ?? null)
  const name = athlete?.display_name?.trim() || profile?.full_name?.trim() || (athleteHome ? t('noName') : user.email ?? t('noName'))
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
    <main className="pf gl gl-scene" style={glassSceneStyle(PAGE_PHOTOS.profile)}>
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
          </section> : <HomeHero
            name={name}
            line={athlete ? [age !== null ? t('age', { age }) : null, athlete.current_team, athlete.province].filter(Boolean).join(' · ') : ''}
            avatarUrl={avatarUrl}
            initials={initials(name)}
            unread={unread ?? null}
            level={athlete ? level : null}
            sport={t(`sports.${ACTIVE_SPORT === 'futsal' ? 'futsal' : 'football'}`)}
          />}
        </aside>

        <div className="pf-main">
          {roleKind && (loaded ? <RoleHomeCard kind={roleKind} home={loaded.home} stats={loaded.stats} /> : <RoleLoadFailed />)}

          {athleteHome && <>
          {!athlete && <section className="pf-card">
            <div className="pf-card-head"><div><h2 className="pf-card-title">{t('noAthlete.title')}</h2><p className="pf-card-desc">{t('noAthlete.body')}</p></div></div>
            <Link href="/profile/edit" className="pf-btn pf-btn-primary"><Camera size={17} aria-hidden="true" />{t('noAthlete.cta')}</Link>
          </section>}

          {/* The third reference (owner, 3 Nov 2026): card and overview, today's missions, the
              next session, an open tournament, then the week. */}
          {athlete && <CardOverview
            name={name}
            team={athlete.current_team ?? null}
            position={rank?.position || athlete.position || null}
            avatarUrl={avatarUrl}
            initials={initials(name)}
            ovr={rank?.ovr ?? null}
            power={rank ? rank.pts : null}
            change={matchChange}
            ranked={Boolean(rank)}
            minutes={view ? totalMinutes(view) : null}
            streak={view && training ? dayStreak(training, today) : null}
          />}
          {/* No programme yet: the programme to pick for their age, as the page's primary step. */}
          {pickProgramme && <TrainingCard recommended={recommendedProgram(age)} age={age} finished={finished} />}
          {view && effort && !finished && <MissionsCard missions={missions} effort={effort} firstOpen={firstOpen} hasNext={Boolean(next)} />}
          {next && <NextTraining next={next} today={today} />}
          {/* The team is one clear next step, not a wall (AGENTS.md product rule): an invitation
              waiting, or how to get into a team, as one line; the list itself is on /me. */}
          {athlete && (teamInvites > 0
            ? <Link href="/team-members" className="pf-card pf-ready-line pf-team-line"><span>{t('teamLine.invites', { count: teamInvites })}</span><ChevronRight size={17} aria-hidden="true" /></Link>
            : !inTeam && <Link href="/me#pf-team-ask" className="pf-card pf-ready-line pf-team-line"><span>{t('teamLine.none')}</span><ChevronRight size={17} aria-hidden="true" /></Link>)}
          {athlete && opportunity && <Opportunity tournament={opportunity} />}
          {view && <WeekProgress goal={goal} effort={effort ? effort.week : null} xp={extras ? extras.weekXp : null} />}

          {readiness && (athlete?.is_public && readiness.next ? <Link href={readiness.next.href} className="pf-card pf-ready-line" id="pf-readiness">
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
          </section> : null)}

          </>}

          {/* An athlete reaches these from /me, their profile tab; every other role keeps them here. */}
          {!athleteHome && <>
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
          </>}
        </div>
      </div>
    </main>
  )
}
