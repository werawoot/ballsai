import type { MetadataRoute } from 'next'
import { getSitemapTournamentIds } from '@/lib/public-data'
import { sitemapEntries } from '@/lib/seo'

// sitemap.xml: public, adult-facing pages and every tournament page (lib/seo.ts).
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return sitemapEntries(await getSitemapTournamentIds())
}
