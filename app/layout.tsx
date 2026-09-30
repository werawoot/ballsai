import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { Sarabun, Oswald, Barlow_Condensed } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import SiteNav from '@/components/SiteNav'
import './globals.css'
import './ui.css'

const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '600', '700', '800'],
  variable: '--font-sarabun',
})

const oswald = Oswald({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-oswald',
})

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
  variable: '--font-barlow',
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return { title: t('title'), description: t('description') }
}

// `viewport-fit=cover` is what makes `env(safe-area-inset-bottom)` report the iPhone home
// indicator's height instead of 0, so the bottom bar can sit above it rather than under it.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The language the person chose (i18n/request.ts). The provider hands the same locale
  // and messages to client components, so a client string can never disagree with the page.
  const locale = await getLocale()
  return (
    <html lang={locale}>
      <body className={`${sarabun.variable} ${oswald.variable} ${barlowCondensed.variable}`}>
        <NextIntlClientProvider>
          {children}
          <SiteNav />
        </NextIntlClientProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
