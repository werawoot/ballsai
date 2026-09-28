import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import EditProfileForm from '../EditProfileForm'
import PageHeader from '@/components/PageHeader'
import { PUBLIC_PROFILE_COLUMNS, fetchMyAthletePrivate } from '@/lib/athlete-private'
import '../profile.css'

// Editing the athlete profile, in sections: details, visibility, highlights,
// achievements. /profile shows the result.
export default async function EditProfilePage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: cookiesToSet => cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/profile/edit')

  const t = await getTranslations('profileEdit')
  const [{ data: profile }, { data: athleteProfile }, { data: videos }, { data: achievements }, { data: highlights }] = await Promise.all([
    supabase.from('profiles').select('full_name, province, team, position').eq('id', user.id).maybeSingle(),
    supabase.from('athlete_profiles').select(PUBLIC_PROFILE_COLUMNS).eq('user_id', user.id).maybeSingle(),
    supabase.from('athlete_videos').select('id, title, video_url, video_type').eq('athlete_id', user.id).order('created_at', { ascending: false }),
    supabase.from('athlete_achievements').select('id, title, event_name, achievement_year, proof_url, verification_status').eq('athlete_id', user.id).order('created_at', { ascending: false }),
    supabase.from('athlete_highlights').select('id, title, media_path, media_type, moderation_status').eq('athlete_id', user.id).order('created_at', { ascending: false }),
  ])
  // The birth date and consent time come only through my_athlete_private (sql/58).
  const athletePrivate = athleteProfile ? await fetchMyAthletePrivate(supabase, user.id).catch(error => {
    console.error(JSON.stringify({ level: 'error', event: 'athlete_private_read_failed', code: error?.code ?? null }))
    return { birth_date: null, guardian_consent_at: null }
  }) : null

  return (
    <main className="pf">
      <PageHeader back={{ href: '/profile', label: t('back') }} />
      <div className="pf-edit">
        <h1 className="pf-edit-title">{t('title')}</h1>
        <EditProfileForm
          profile={profile}
          athleteProfile={athleteProfile ? { ...(athleteProfile as object), ...athletePrivate } as never : null}
          videos={(videos ?? []) as never}
          achievements={(achievements ?? []) as never}
          highlights={(highlights ?? []) as never}
          userId={user.id}
        />
      </div>
    </main>
  )
}
