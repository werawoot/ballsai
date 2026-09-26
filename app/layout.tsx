import type { Metadata, Viewport } from 'next'
import { Sarabun, Oswald, Barlow_Condensed } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import SiteNav from '@/components/SiteNav'
import './globals.css'

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

export const metadata: Metadata = {
  title: 'BallDoenSai.com — แพลตฟอร์มกีฬาเด็กไทย',
  description: 'ตารางอันดับนักกีฬาเยาวชนไทย',
}

// `viewport-fit=cover` is what makes `env(safe-area-inset-bottom)` report the iPhone home
// indicator's height instead of 0, so the bottom bar can sit above it rather than under it.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className={`${sarabun.variable} ${oswald.variable} ${barlowCondensed.variable}`}>
        {children}
        <SiteNav />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
