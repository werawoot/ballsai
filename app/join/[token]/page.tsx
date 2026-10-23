import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { MapPin, UserRound, UsersRound } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isJoinToken, joinPath } from '@/lib/team-join'
import JoinRequestButton from './JoinRequestButton'
import '../../team-members/team-page.css'
import '../../glass.css'
import '../../team-members/team-glass.css'
import { glassSceneStyle, PAGE_PHOTOS } from '@/lib/stock-photos'

// A team's join link (ADR-011). Anyone with the link sees the team's name, the coach's
// display name and the province, never the roster. Asking to join needs sign-in and an
// athlete profile; ?ask=1 sends the request by itself after the person comes back.
export default async function JoinTeamPage(props: { params: Promise<{ token: string }>; searchParams: Promise<{ ask?: string }> }) {
  const [{ token }, { ask }] = await Promise.all([props.params, props.searchParams])
  if (!isJoinToken(token)) notFound()
  const supabase = await createServerSupabaseClient()
  const [{ data: rows }, { data: { user } }, t] = await Promise.all([
    supabase.rpc('team_join_preview', { p_token: token }),
    supabase.auth.getUser(),
    getTranslations('joinPage'),
  ])
  const team = ((rows ?? []) as { team_name: string; coach_name: string | null; province: string | null; open: boolean }[])[0] ?? null
  const back = `${joinPath(token)}?ask=1`

  return <main className="bds-page tp tp-join gl gl-scene" style={glassSceneStyle(PAGE_PHOTOS.join)}>
    <PageHeader back={{ href: '/', label: t('home') }} />
    <section className="tj-head">
      <div className="tj-head-inner">
        <p className="ui-eyebrow">{t('eyebrow')}</p>
        <h1 className="tp-title">{team ? team.team_name : t('goneTitle')}</h1>
      </div>
    </section>
    <div className="tp-wrap">
      {!team
        ? <p className="tp-note">{t('goneBody')}</p>
        : <>
            <ul className="ui-card tj-card tj-facts">
              <li><UserRound size={16} aria-hidden="true" />{t('coach')}: <b>{team.coach_name ?? t('coachUnnamed')}</b></li>
              {team.province && <li><MapPin size={16} aria-hidden="true" />{t('province')}: <b>{team.province}</b></li>}
              <li><UsersRound size={16} aria-hidden="true" />{t('privacy')}</li>
            </ul>
            {!team.open
              ? <p className="tp-alert" role="status">{t('closed')}</p>
              : user
                ? <JoinRequestButton token={token} auto={ask === '1'} userId={user.id} welcomePath={`/welcome?again=1&next=${encodeURIComponent(back)}`} />
                : <>
                    <Link className="ui-btn ui-btn-primary" href={`/login?next=${encodeURIComponent(back)}`}>{t('signIn')}</Link>
                    <p className="tp-note">{t('signInHint')}</p>
                  </>}
          </>}
    </div>
  </main>
}
