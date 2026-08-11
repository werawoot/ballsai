'use client'

import Link from 'next/link'
import { ArrowLeft, ArrowRight, ArrowUpRight, Eye, PlayCircle, Sparkles, Trophy, Zap } from 'lucide-react'
import { TouchEvent, useEffect, useState } from 'react'

const slides = [
  { label: 'THAILAND · YOUTH FOOTBALL · 2026', title: <>สนามนี้<br /><em>มีคนเห็น</em><br />ทุกพรสวรรค์</>, description: <>พื้นที่ที่ผลงานของนักกีฬาเยาวชนไทย<br className="home-desktop-only" /> มีความหมาย และมีโอกาสไปไกลกว่าเดิม</> },
  { label: 'THE IMPACT · 01 / 03', title: <>ทุกผลงาน<br />ต้องมี<br /><em>คนเห็น</em></>, description: <>สร้างโปรไฟล์ที่เป็นมากกว่าชื่อ ให้ความสามารถของน้องมีที่ยืนบนโลกฟุตบอล</> },
  { label: 'THE IMPACT · 02 / 03', title: <>จากสนามเล็ก<br />ไปสู่<br /><em>โอกาสใหญ่</em></>, description: <>ทุกแมตช์ ทุก Highlight และทุกความพยายาม คือประตูบานใหม่ของน้อง</> },
]

export default function HomeHeroCarousel() {
  const [active, setActive] = useState(0)
  const [touchStart, setTouchStart] = useState<number | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setActive(current => (current + 1) % slides.length), 7500)
    return () => window.clearInterval(timer)
  }, [])

  const swipe = (event: TouchEvent<HTMLElement>) => {
    if (touchStart === null) return
    const distance = event.changedTouches[0].clientX - touchStart
    if (Math.abs(distance) > 42) setActive(current => distance < 0 ? (current + 1) % slides.length : (current - 1 + slides.length) % slides.length)
    setTouchStart(null)
  }

  return (
    <section className="home-hero home-hero-slider" onTouchStart={event => setTouchStart(event.touches[0].clientX)} onTouchEnd={swipe} aria-roledescription="carousel" aria-label="เรื่องราวของ BallDoenSai.com">
      <div className="home-hero-grain" />
      <div className="home-pitch home-pitch-one" />
      <div className="home-pitch home-pitch-two" />
      <div className="home-orbit home-orbit-one"><span /></div>
      <div className="home-orbit home-orbit-two"><span /></div>
      <div className="home-slides" style={{ transform: `translateX(-${active * (100 / slides.length)}%)` }}>
        <article className="home-hero-slide">
          <div className="home-hero-content">
            <div className="home-kicker"><span className="home-live-dot" /> {slides[0].label}</div>
            <h1>{slides[0].title}</h1><p>{slides[0].description}</p>
            <div className="home-hero-actions"><Link href="/card" className="home-primary-cta">สร้าง Player Card <ArrowUpRight size={18} /></Link><button type="button" className="home-secondary-cta home-slide-button" onClick={() => setActive(1)}>BallDoenSai.com ช่วยอะไร <ArrowRight size={17} /></button></div>
          </div>
          <div className="home-hero-player" aria-hidden="true"><div className="home-player-number">10</div><div className="home-player-silhouette"><Zap size={88} strokeWidth={1} /></div><div className="home-player-caption"><span>YOUR GAME</span><b>YOUR STORY</b></div></div>
        </article>

        <article className="home-hero-slide home-impact-slide">
          <div className="home-hero-content">
            <div className="home-kicker"><span className="home-live-dot" /> {slides[1].label}</div>
            <h1>{slides[1].title}</h1><p>{slides[1].description}</p>
            <div className="home-hero-actions"><Link href="/card" className="home-primary-cta">สร้าง Player Card <ArrowUpRight size={18} /></Link><Link href="/impact" className="home-secondary-cta">ดูเป้าหมายทั้งหมด</Link></div>
          </div>
          <div className="home-slide-infographic home-infographic-visible" aria-hidden="true"><div className="home-info-eye"><Eye size={58} /></div><div className="home-info-line" /><div className="home-info-tag home-info-tag-one"><Sparkles size={15} /> โปรไฟล์</div><div className="home-info-tag home-info-tag-two"><PlayCircle size={15} /> Highlight</div><div className="home-info-tag home-info-tag-three"><Trophy size={15} /> ผลงาน</div><b>SEEN</b></div>
        </article>

        <article className="home-hero-slide home-impact-slide">
          <div className="home-hero-content">
            <div className="home-kicker"><span className="home-live-dot" /> {slides[2].label}</div>
            <h1>{slides[2].title}</h1><p>{slides[2].description}</p>
            <div className="home-hero-actions"><Link href="/tournaments" className="home-primary-cta">ดูรายการแข่ง <ArrowUpRight size={18} /></Link><Link href="/impact" className="home-secondary-cta">รู้จัก BallDoenSai.com</Link></div>
          </div>
        </article>
      </div>
      <div className="home-carousel-controls"><button type="button" className="home-carousel-arrow home-carousel-prev" aria-label="สไลด์ก่อนหน้า" onClick={() => setActive(current => (current - 1 + slides.length) % slides.length)}><ArrowLeft size={22} /><span>ก่อนหน้า</span></button><div className="home-carousel-dots">{slides.map((slide, index) => <button key={slide.label} type="button" aria-label={`ไปสไลด์ ${index + 1}`} aria-current={active === index} className={active === index ? 'is-active' : ''} onClick={() => setActive(index)} />)}</div><button type="button" className="home-carousel-arrow home-carousel-next" aria-label="สไลด์ถัดไป" onClick={() => setActive(current => (current + 1) % slides.length)}><span>ถัดไป</span><ArrowRight size={22} /></button></div>
      <div className="home-scroll-cue"><span /> ปัดเพื่อดูว่า BallDoenSai.com ช่วยอะไร</div>
    </section>
  )
}
