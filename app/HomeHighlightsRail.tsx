'use client'

import Link from 'next/link'
import { ArrowLeft, ArrowRight, Play } from 'lucide-react'
import { useState } from 'react'

const items = [
  { title: 'ทุกเกมคือหลักฐานของความตั้งใจ', meta: 'BALLDOENSAI ORIGINAL · 02:18', href: '/impact', image: 'is-highlight-one' },
  { title: '3 ดาวรุ่งที่กำลังขยับขึ้นบน Ranking', meta: 'WEEKLY RANKING · 01:45', href: '/ranking', image: 'is-highlight-two' },
  { title: 'โปรไฟล์ที่ดี เริ่มจากเรื่องจริงของน้อง', meta: 'PLAYER STORY · 03:06', href: '/profile', image: 'is-highlight-three' },
  { title: 'สนามเล็กที่พาไปเจอโอกาสใหญ่', meta: 'MATCHDAY · 02:50', href: '/tournaments', image: 'is-highlight-four' },
]

export default function HomeHighlightsRail() {
  const [start, setStart] = useState(0)
  const visible = [0, 1, 2].map(offset => items[(start + offset) % items.length])

  return <section className="home-highlights" aria-label="Highlight ล่าสุด">
    <div className="home-highlights-head">
      <div><span className="home-eyebrow">WATCH / LEARN / GROW</span><h2>HIGHLIGHTS</h2></div>
      <div className="home-rail-actions"><button type="button" aria-label="Highlight ก่อนหน้า" onClick={() => setStart(current => (current - 1 + items.length) % items.length)}><ArrowLeft size={18} /></button><button type="button" aria-label="Highlight ถัดไป" onClick={() => setStart(current => (current + 1) % items.length)}><ArrowRight size={18} /></button></div>
    </div>
    <div className="home-highlight-grid">
      {visible.map((item, index) => <Link key={`${item.title}-${index}`} href={item.href} className={`home-highlight-card ${item.image}`}>
        <span className="home-highlight-play"><Play size={18} fill="currentColor" /></span>
        <div className="home-highlight-copy"><small>{item.meta}</small><h3>{item.title}</h3></div>
      </Link>)}
    </div>
  </section>
}
