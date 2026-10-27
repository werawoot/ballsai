import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import PageHeader from '@/components/PageHeader'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { glassSceneStyle } from '@/lib/stock-photos'
import { APPLICANT_DRAFT_LIMIT, organizerAccessState, type OrganizerRequestRow } from '@/lib/organizer-access'
import OrganizerRequestForm from './OrganizerRequestForm'
import '../glass.css'
import './organizer-request.css'

// Ask to become an organizer (ADR-013, sql/89). One person can start alone: while the
// request waits, they keep up to three draft tournaments only they and admins can see.
// An organizer or admin has nothing to ask for and goes to the dashboard.

type DraftRow = { id: string; name: string; start_date: string | null }

export default async function OrganizerRequestPage() {
  const db = await createServerSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login?next=/organizer-request')

  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role === 'organizer' || profile?.role === 'admin') redirect('/dashboard')

  const [t, locale, requests, revocation] = await Promise.all([
    getTranslations('organizerRequest'),
    getLocale(),
    db.from('organizer_requests')
      .select('id, status, created_at, decided_at, decision_reason, org_name, province')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
    db.from('organizer_revocations').select('created_at').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const notReady = Boolean(requests.error)
  const rows = (requests.data ?? []) as Array<OrganizerRequestRow & { org_name: string; province: string }>
  const state = organizerAccessState({ role: profile?.role, requests: rows, lastRevocationAt: revocation.data?.created_at ?? null, now: new Date() })

  const drafts: DraftRow[] = state.kind === 'pending'
    ? ((await db.from('tournaments').select('id, name, start_date').eq('organizer_id', user.id).eq('status', 'draft')
        .order('start_date', { ascending: true }).limit(APPLICANT_DRAFT_LIMIT)).data ?? []) as DraftRow[]
    : []
  const date = (at: string | Date) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(at))
  const pending = state.kind === 'pending' ? rows.find(row => row.id === state.requestId) : null

  return (
    <main className="bds-page or-page gl gl-scene" style={glassSceneStyle(null)}>
      <PageHeader />
      <section className="or-wrap">
        <p className="or-eyebrow">{t('eyebrow')}</p>
        <h1 className="or-title">{t('title')}</h1>
        <p className="or-intro">{t('intro')}</p>

        {notReady && <div className="or-card gl-card" role="status"><p>{t('notReady')}</p></div>}

        {!notReady && state.kind === 'pending' && pending && <>
          <div className="or-card gl-card" role="status">
            <span className="or-badge is-wait">{t('pending.badge')}</span>
            <h2>{t('pending.title')}</h2>
            <p>{t('pending.text', { org: pending.org_name, province: pending.province, date: date(pending.created_at) })}</p>
          </div>
          <div className="or-card gl-card">
            <h2>{t('drafts.title', { count: drafts.length, limit: APPLICANT_DRAFT_LIMIT })}</h2>
            <p>{t('drafts.text', { limit: APPLICANT_DRAFT_LIMIT })}</p>
            {drafts.length > 0 && <ul className="or-drafts">
              {drafts.map(draft => <li key={draft.id}>
                <Link href={`/dashboard/tournaments/${draft.id}/edit`}><b>{draft.name}</b>{draft.start_date && <span>{date(draft.start_date)}</span>}</Link>
              </li>)}
            </ul>}
            {drafts.length < APPLICANT_DRAFT_LIMIT
              ? <Link className="gl-btn gl-btn-primary or-cta" href="/dashboard/create">{t('drafts.create')}</Link>
              : <p className="or-note">{t('drafts.full', { limit: APPLICANT_DRAFT_LIMIT })}</p>}
          </div>
        </>}

        {!notReady && state.kind === 'cooldown' && <div className="or-card gl-card" role="status">
          <span className="or-badge is-no">{t('cooldown.badge')}</span>
          <h2>{t('cooldown.title')}</h2>
          {state.reason && <p>{t('cooldown.reason', { reason: state.reason })}</p>}
          <p>{t('cooldown.until', { date: date(state.until) })}</p>
        </div>}

        {!notReady && state.kind === 'can_request' && <>
          {state.lastReason && <div className="or-card gl-card" role="status"><p>{t('lastReason', { reason: state.lastReason })}</p></div>}
          <OrganizerRequestForm />
        </>}

        <div className="or-card gl-card or-meanwhile">
          <h2>{t('meanwhile.title')}</h2>
          <p>{t('meanwhile.text')}</p>
          <Link className="gl-btn gl-btn-secondary or-cta" href="/tournaments">{t('meanwhile.cta')}</Link>
        </div>
      </section>
    </main>
  )
}
