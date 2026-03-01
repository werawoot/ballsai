import type { Metadata } from 'next'
import { Sarabun, Oswald, Barlow_Condensed } from 'next/font/google'
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
  title: 'Ballsai — แพลตฟอร์มกีฬาเด็กไทย',
  description: 'ตารางอันดับนักกีฬาเยาวชนไทย',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className={`${sarabun.variable} ${oswald.variable} ${barlowCondensed.variable}`}>
        {children}
      </body>
    </html>
  )
}