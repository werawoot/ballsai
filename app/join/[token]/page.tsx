import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { MapPin, UserRound, UsersRound } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isJoinToken, joinPath } from '@/lib/team-join'
import JoinRequestButton from './JoinRequestButton'
import '../../team-members/team-page.css'

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

  return <main className="bds-page ui-matchday tp">
    <PageHeader back={{ href: '/', label: t('home') }} />
    <div className="tp-wrap">
      <p className="ui-eyebrow">{t('eyebrow')}</p>
      {!team
        ? <>
            <h1 className="tp-title">{t('goneTitle')}</h1>
            <p className="tp-note">{t('goneBody')}</p>
          </>
        : <>
            <h1 className="tp-title">{team.team_name}</h1>
            <ul className="ui-card tj-card tj-facts">
              <li><UserRound size={16} aria-hidden="true" />{t('coach')}: <b>{team.coach_name ?? t('coachUnnamed')}</b></li>
              {team.province && <li><MapPin size={16} aria-hidden="true" />{t('province')}: <b>{team.province}</b></li>}
              <li><UsersRound size={16} aria-hidden="true" />{t('privacy')}</li>
            </ul>
            {!team.open
              ? <p className="tp-alert" role="status">{t('closed')}</p>
              : user
                ? <JoinRequestButton token={token} auto={ask === '1'} welcomePath={`/welcome?again=1&next=${encodeURIComponent(back)}`} />
                : <>
                    <Link className="ui-btn ui-btn-primary" href={`/login?next=${encodeURIComponent(back)}`}>{t('signIn')}</Link>
                    <p className="tp-note">{t('signInHint')}</p>
                  </>}
          </>}
    </div>
  </main>
}
