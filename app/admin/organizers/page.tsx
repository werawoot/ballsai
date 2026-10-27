import { getLocale, getTranslations } from 'next-intl/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import Pagination from '@/components/Pagination'
import { parsePage } from '@/lib/pagination'
import OrganizerDecisionList, { type OrganizerItem, type RequestItem } from './OrganizerDecisionList'
import './organizers.css'

// The organizer request queue and the list of organizers (ADR-013, sql/89). Oldest request
// first; both lists are read one page at a time. Every admin sees the same queue, and the
// first decision closes a request for all of them (row lock in decide_organizer_request).
const PAGE_SIZE = 25

type RequestRow = { id: string; user_id: string; org_name: string; org_type: string; province: string; phone: string; note: string; created_at: string }
type ProfileRow = { id: string; full_name: string | null; email: string | null }
type ApprovedRow = { user_id: string; org_name: string; province: string; created_at: string }

export default async function AdminOrganizersPage(props: { searchParams?: Promise<{ page?: string; opage?: string }> }) {
  const searchParams = (await props.searchParams) ?? {}
  const page = parsePage(searchParams.page)
  const organizerPage = parsePage(searchParams.opage)
  const db = await createServerSupabaseClient()
  const [t, locale] = await Promise.all([getTranslations('adminOrganizers'), getLocale()])

  const from = (page - 1) * PAGE_SIZE
  const organizerFrom = (organizerPage - 1) * PAGE_SIZE
  const [requests, organizers] = await Promise.all([
    db.from('organizer_requests').select('id, user_id, org_name, org_type, province, phone, note, created_at')
      .eq('status', 'pending').order('created_at', { ascending: true }).order('id', { ascending: true })
      .range(from, from + PAGE_SIZE),
    db.from('profiles').select('id, full_name, email').eq('role', 'organizer')
      .order('id', { ascending: true }).range(organizerFrom, organizerFrom + PAGE_SIZE),
  ])
  const requestRows = ((requests.data ?? []) as RequestRow[])
  const organizerRows = ((organizers.data ?? []) as ProfileRow[])
  const pendingPage = requestRows.slice(0, PAGE_SIZE)
  const organizerPageRows = organizerRows.slice(0, PAGE_SIZE)

  const applicantIds = pendingPage.map(row => row.user_id)
  const organizerIds = organizerPageRows.map(row => row.id)
  const [applicants, approved] = await Promise.all([
    applicantIds.length ? db.from('profiles').select('id, full_name, email').in('id', applicantIds) : { data: [] as ProfileRow[] },
    organizerIds.length ? db.from('organizer_requests').select('user_id, org_name, province, created_at').eq('status', 'approved').in('user_id', organizerIds) : { data: [] as ApprovedRow[] },
  ])
  const who = new Map(((applicants.data ?? []) as ProfileRow[]).map(row => [row.id, row]))
  const org = new Map<string, ApprovedRow>()
  for (const row of ((approved.data ?? []) as ApprovedRow[])) {
    const current = org.get(row.user_id)
    if (!current || current.created_at < row.created_at) org.set(row.user_id, row)
  }
  const date = (at: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(at))

  const requestItems: RequestItem[] = pendingPage.map(row => ({
    id: row.id,
    name: who.get(row.user_id)?.full_name || who.get(row.user_id)?.email || t('noName'),
    email: who.get(row.user_id)?.email ?? '',
    orgName: row.org_name,
    orgType: row.org_type,
    province: row.province,
    phone: row.phone,
    note: row.note,
    createdAt: date(row.created_at),
  }))
  const organizerItems: OrganizerItem[] = organizerPageRows.map(row => ({
    userId: row.id,
    name: row.full_name || row.email || t('noName'),
    email: row.email ?? '',
    orgName: org.get(row.id)?.org_name ?? null,
    province: org.get(row.id)?.province ?? null,
  }))

  return (
    <main className="ao-page">
      <header className="ao-head">
        <p className="ao-eyebrow">{t('eyebrow')}</p>
        <h1>{t('title')}</h1>
        <p>{t('intro')}</p>
      </header>
      {requests.error
        ? <p className="ao-alert" role="status">{t('notReady')}</p>
        : <>
          <section className="ao-section" aria-labelledby="ao-queue">
            <h2 id="ao-queue">{t('queueTitle')}</h2>
            <OrganizerDecisionList requests={requestItems} organizers={[]} />
            <Pagination basePath="/admin/organizers" page={page} hasNext={requestRows.length > PAGE_SIZE} params={{ opage: searchParams.opage ?? '' }} />
          </section>
          <section className="ao-section" aria-labelledby="ao-organizers">
            <h2 id="ao-organizers">{t('organizersTitle')}</h2>
            <p className="ao-muted">{t('organizersIntro')}</p>
            <OrganizerDecisionList requests={[]} organizers={organizerItems} />
            <Pagination basePath="/admin/organizers" page={organizerPage} hasNext={organizerRows.length > PAGE_SIZE} pageParam="opage" params={{ page: searchParams.page ?? '' }} />
          </section>
        </>}
    </main>
  )
}
