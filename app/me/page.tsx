import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import {
  BadgeCheck, Bell, Building2, ChevronRight, Compass, Dumbbell, Eye, EyeOff, Handshake, IdCard, LayoutDashboard, LogOut,
  MapPin, PencilLine, Route, ShieldCheck, Trophy, UsersRound, type LucideIcon,
} from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import CardGuide from '@/components/CardGuide'
import PublicProfileShare from '@/app/profile/PublicProfileShare'
import DeleteMyDataSection from '@/app/profile/DeleteMyDataSection'
import { fetchProfileHome } from '@/lib/profile-home'
import { homeKind, type HomeKind } from '@/lib/role-home'
import { ageOn, shownAge, thaiDate } from '@/lib/athlete-private'
import { signAvatarUrls } from '@/lib/athlete-avatar'
import { fetchSeasonStats, fetchVerifiedSkillRow } from '@/lib/athlete-home-data'
import { verifiedSkills } from '@/lib/athlete-home'
import { SkillRadar } from '@/app/profile/AthleteHome'
import TeamAskButton from '@/app/profile/TeamAskButton'
import type messagesTh from '@/messages/th.json'
import { fetchUnreadNotificationCount } from '@/lib/notification-count'
import { unreadBadge } from '@/lib/notification-unread'
import { ACTIVE_SEASON } from '@/lib/season'
import { glassSceneStyle, PAGE_PHOTOS } from '@/lib/stock-photos'
import '../glass.css'
import '../profile/profile.css'

// /me, the athlete's profile tab (DOENSAI dashboard design, owner 2 Nov 2026): who they are,
// this season's verified numbers, and every place that left the home page: their team,
// card, history, training, notifications, venues, sponsorships, their public page, the account
// and PDPA data deletion. /profile is their home. Any other role may open it too.

type AthleteRow = {
  display_name: string
  position?: string | null
  province?: string | null
  current_team?: string | null
  profile_image_url?: string | null
  is_public: boolean
  verification_level: 'self' | 'coach_verified' | 'performance_verified'
}
type TeamStatus = keyof (typeof messagesTh)['profileHome']['teams']['status']
type Membership = {
  status: 'pending' | 'accepted' | 'declined' | 'removed'
  teams: { id: string; name: string; status: string; tournaments: { name: string | null; location: string | null }[] | { name: string | null; location: string | null } | null } | null
}
type MenuKey = 'teamMembers' | 'card' | 'career' | 'venues' | 'sponsorships' | 'admin' | 'dashboard'
type MenuItem = { href: string; icon: LucideIcon; shortcut?: MenuKey; own?: 'notifications' | 'training'; count?: number }

const KIND_ICONS: Record<HomeKind, LucideIcon> = { athlete: IdCard, guardian: UsersRound, coach: Compass, organizer: Trophy, venue: Building2, sponsor: Handshake }
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => [...part][0] ?? '').join('').toUpperCase() || '?'

export default async function MePage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: cookiesToSet => cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/me')

  const [t, p, s] = await Promise.all([getTranslations('mePage'), getTranslations('profileHome'), getTranslations('roleHome')])
  // The same one call as /profile (sql/91), or its separate reads before that file.
  const home = await fetchProfileHome(supabase, user.id)
  const kind = homeKind({ persona: home.profile?.onboarding_persona, role: home.profile?.role })
  const athlete = home.athlete as AthleteRow | null
  const rank = home.rank
  const [avatarUrls, stats, unread, skillRow] = await Promise.all([
    // The photo is a private object (T51); the owner may always sign their own.
    signAvatarUrls(supabase, [athlete?.profile_image_url ?? null]),
    fetchSeasonStats(supabase, rank?.id ?? null),
    fetchUnreadNotificationCount(supabase, user.id),
    athlete ? fetchVerifiedSkillRow(supabase, user.id) : null,
  ])
  const skills = verifiedSkills(skillRow)
  const memberships = home.memberships as unknown as Membership[]
  const avatarUrl = athlete?.profile_image_url ? avatarUrls.get(athlete.profile_image_url) ?? null : null
  const birthDate = home.private?.birth_date
  const age = shownAge(birthDate ? ageOn(birthDate, thaiDate(new Date())) : null)
  const name = athlete?.display_name?.trim() || home.profile?.full_name?.trim() || user.email || p('noName')
  const publicPath = `/players/${rank?.id || user.id}`
  const badge = unreadBadge(unread)
  const pendingInvites = home.memberships.filter(membership => membership.status === 'pending').length

  // The organizer dashboard is for whoever an admin made an organizer, and only them.
  const role = home.profile?.role
  const menu: MenuItem[] = [
    ...(role === 'admin' ? [{ href: '/admin', icon: ShieldCheck, shortcut: 'admin' as const }] : []),
    ...(role === 'organizer' || role === 'admin' ? [{ href: '/dashboard', icon: LayoutDashboard, shortcut: 'dashboard' as const }] : []),
    { href: '/team-members', icon: UsersRound, shortcut: 'teamMembers', count: pendingInvites },
    ...(athlete ? [
      { href: '/card', icon: IdCard, shortcut: 'card' as const },
      { href: '/career', icon: Route, shortcut: 'career' as const },
      { href: '/training', icon: Dumbbell, own: 'training' as const },
    ] : []),
    { href: '/notifications', icon: Bell, own: 'notifications', count: unread ?? 0 },
    { href: '/venues', icon: Building2, shortcut: 'venues' },
    { href: '/sponsorships', icon: Handshake, shortcut: 'sponsorships' },
  ]
  const statCells = stats && (stats.matches_played ?? 0) > 0 ? [
    { key: 'matches', value: stats.matches_played ?? 0 },
    { key: 'goals', value: stats.goals ?? 0 },
    { key: 'assists', value: stats.assists ?? 0 },
    { key: 'mvps', value: stats.mvps ?? 0 },
  ] as const : null

  return (
    <main className="pf pf-me gl gl-scene" style={glassSceneStyle(PAGE_PHOTOS.profile)}>
      <PageHeader eyebrow={t('eyebrow')} />
      <div className="pf-shell">
        <aside className="pf-aside">
          <section className="pf-hero" aria-labelledby="pf-name">
            <div className="pf-id">
              {athlete
                ? <div className="pf-avatar" style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined} aria-hidden="true">{!avatarUrl && initials(name)}</div>
                // An icon, not the first letter: a Thai name can start with a vowel mark that is no one's initial.
                : <div className="pf-avatar" aria-hidden="true">{(() => { const Icon = KIND_ICONS[kind]; return <Icon size={30} /> })()}</div>}
              <div style={{ minWidth: 0 }}>
                <h1 id="pf-name" className="pf-name">{name}</h1>
                <div className="pf-sub">{athlete ? [athlete.current_team, athlete.province].filter(Boolean).join(' · ') || ' ' : s('as', { role: s(`roles.${kind}`) })}</div>
              </div>
            </div>
            {athlete && <div className="pf-chips">
              {athlete.position && <span className="pf-chip is-gold">{athlete.position}</span>}
              {age !== null && <span className="pf-chip">{p('age', { age })}</span>}
              <span className={`pf-chip${athlete.verification_level !== 'self' ? ' is-green' : ''}`}>
                {athlete.verification_level !== 'self' && <BadgeCheck size={13} aria-hidden="true" />}{p(`verification.${athlete.verification_level}`)}
              </span>
              <span className="pf-chip">{athlete.is_public ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}{p(athlete.is_public ? 'visibility.public' : 'visibility.private')}</span>
            </div>}
            <div className="pf-actions">
              <Link href="/profile/edit" className="pf-btn pf-btn-ghost"><PencilLine size={17} aria-hidden="true" />{athlete ? p('actions.edit') : p('noAthlete.cta')}</Link>
              {athlete?.is_public && <Link href={publicPath} className="pf-btn pf-btn-ghost"><Eye size={17} aria-hidden="true" />{p('actions.viewPublic')}</Link>}
            </div>
          </section>
        </aside>

        <div className="pf-main">
          {athlete && <section className="pf-card" aria-labelledby="me-stats">
            <div className="pf-card-head"><h2 id="me-stats" className="pf-card-title">{t('stats.title', { season: ACTIVE_SEASON })}</h2></div>
            {statCells
              ? <dl className="me-stats">{statCells.map(cell => <div key={cell.key}><dt>{t(`stats.${cell.key}`)}</dt><dd>{cell.value.toLocaleString()}</dd></div>)}</dl>
              : <p className="pf-note">{t('stats.none')}</p>}
            {statCells && <p className="pf-note">{t('stats.note')}</p>}
          </section>}

          <section aria-labelledby="me-menu">
            <h2 id="me-menu" className="pf-card-title" style={{ marginBottom: 14 }}>{t('menu.title')}</h2>
            <ul className="me-menu">
              {menu.map(item => {
                const Icon = item.icon
                const label = item.shortcut ? p(`shortcuts.items.${item.shortcut}.label`) : t(`menu.${item.own!}.label`)
                const hint = item.shortcut ? p(`shortcuts.items.${item.shortcut}.hint`) : t(`menu.${item.own!}.hint`)
                const count = item.own === 'notifications' ? badge : unreadBadge(item.count)
                return <li key={item.href}>
                  <Link href={item.href}>
                    <span className="pf-link-icon"><Icon size={19} aria-hidden="true" /></span>
                    <span className="me-menu-text"><b>{label}</b><small>{hint}</small></span>
                    {count && <span className="me-menu-count" aria-label={t('menu.unread', { count: count.count })}>{count.text}</span>}
                    <ChevronRight size={17} aria-hidden="true" />
                  </Link>
                </li>
              })}
            </ul>
          </section>

          {athlete && <SkillRadar skills={skills} />}
          {athlete && <CardGuide />}

          {memberships.length > 0 && <section className="pf-card" aria-labelledby="pf-teams">
            <div className="pf-card-head">
              <h2 id="pf-teams" className="pf-card-title">{p('teams.title')}</h2>
              <Link href="/team-members" className="pf-card-meta tap-44" style={{ textDecoration: 'none' }}>{pendingInvites > 0 ? p('teams.viewAll') : p('teams.viewTeams')}</Link>
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
                    <b>{team?.name ?? p('teams.unnamed')}</b>
                    <span>{tournament?.name ?? p('teams.tournament')}{tournament?.location ? <> · <MapPin size={11} aria-hidden="true" style={{ verticalAlign: '-1px' }} /> {tournament.location}</> : null}</span>
                  </div>
                  <span className={`pf-badge ${tone}`}>{p(`teams.status.${status}`)}</span>
                </li>
              })}
            </ul>
          </section>}

          {/* No team yet: the coach's invitation is the step after, not a wall (AGENTS.md product rule). */}
          {athlete && memberships.length === 0 && <section className="pf-card pf-team-ask" aria-labelledby="pf-team-ask">
            <h2 id="pf-team-ask" className="pf-card-title">{p('teamAsk.title')}</h2>
            <p className="pf-card-desc">{p('teamAsk.body')}</p>
            <TeamAskButton email={user.email ?? ''} />
          </section>}


          {athlete?.is_public && <PublicProfileShare profilePath={publicPath} isPublic />}


          <section className="pf-card" aria-labelledby="pf-account">
            <div className="pf-card-head"><h2 id="pf-account" className="pf-card-title">{p('account.title')}</h2></div>
            <div className="pf-account">
              <div style={{ minWidth: 0 }}><small>{p('account.signedInAs')}</small><b>{user.email}</b></div>
              <form action="/auth/signout" method="POST">
                <button type="submit" className="pf-btn pf-btn-line pf-btn-sm"><LogOut size={15} aria-hidden="true" />{p('account.signOut')}</button>
              </form>
            </div>
          </section>

          <DeleteMyDataSection />
        </div>
      </div>
    </main>
  )
}
