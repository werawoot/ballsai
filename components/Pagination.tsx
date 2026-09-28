import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// Previous / next links for a list read one page at a time. There is no page count on
// purpose: counting every row of a nationwide table on each view costs more than the
// list itself, and "is there a next page" is all the reader needs.
// Not async, like PageHeader, so both server and client pages can render it.
// `params` are the list's filters: they stay in both links, so the next page is the next
// page of the same filtered list. `pageParam` names this list's page in the URL when one
// page holds two paged lists (the other list's page then goes in `params`).
export default function Pagination({ basePath, page, hasNext, params = {}, pageParam = 'page' }: { basePath: string; page: number; hasNext: boolean; params?: Record<string, string>; pageParam?: string }) {
  const t = useTranslations('pagination')
  if (page <= 1 && !hasNext) return null
  const href = (target: number) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value))
    query.set(pageParam, String(target))
    return `${basePath}?${query.toString()}`
  }
  return <nav className="bds-pagination" aria-label={t('label')}>
    {page > 1
      ? <Link href={href(page - 1)} rel="prev" className="bds-pagination-link"><ChevronLeft size={16} aria-hidden="true" />{t('previous')}</Link>
      : <span />}
    <span className="bds-pagination-current" aria-current="page">{t('current', { page })}</span>
    {hasNext
      ? <Link href={href(page + 1)} rel="next" className="bds-pagination-link">{t('next')}<ChevronRight size={16} aria-hidden="true" /></Link>
      : <span />}
  </nav>
}
