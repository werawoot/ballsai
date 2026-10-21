'use client'

import Link from 'next/link'
import { useEffect, useState, type CSSProperties } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'

// Three sample athlete cards on a turning ring, telling the three steps on the home page
// while no tournament is open (owner, 21 Oct 2026). Every card says it is a sample and
// names no real athlete (AGENTS.md rule 8); skills not yet assessed show a dash. All
// wording comes from the page, so this file holds no copy.

export type RingCard = {
  tier: 'starter' | 'rated' | 'hall'
  step: string
  title: string
  body: string
  rating: string
  ratingLabel: string
  position: string
  name: string
  facts: Array<{ label: string; value: string }>
  stats: Array<{ label: string; value: string }>
}

type Labels = { sample: string; region: string; previous: string; next: string; pause: string; play: string; cta: string; slide: string }

const TURN_MS = 4200

// Moves by itself only while not paused and while the device does not ask for less motion.
export function ringAdvances({ paused, reducedMotion }: { paused: boolean; reducedMotion: boolean }) {
  return !paused && !reducedMotion
}

export default function HomeCardRing({ cards, labels, ctaHref }: { cards: RingCard[]; labels: Labels; ctaHref: string }) {
  const [turn, setTurn] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hover, setHover] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const count = cards.length
  const active = ((turn % count) + count) % count

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])

  useEffect(() => {
    if (!ringAdvances({ paused: paused || hover, reducedMotion })) return
    const timer = window.setInterval(() => setTurn(current => current + 1), TURN_MS)
    return () => window.clearInterval(timer)
  }, [paused, hover, reducedMotion])

  const step = 360 / count
  const current = cards[active]

  return <section className="hm-ring gl-panel" aria-roledescription="carousel" aria-label={labels.region}
    onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
    <div className="hm-ring-stage">
      <div className="hm-ring-spin" style={{ transform: `translateZ(calc(var(--ring-r) * -1)) rotateY(${-turn * step}deg)` }}>
        {cards.map((card, index) => <article key={card.tier} className={`hm-fut is-${card.tier}${index === active ? ' is-front' : ''}`}
          style={{ transform: `rotateY(${index * step}deg) translateZ(var(--ring-r))` } as CSSProperties}
          aria-hidden={index !== active} aria-roledescription={labels.slide} aria-label={`${card.step} ${card.title}`}>
          <span className="hm-fut-sample">{labels.sample}</span>
          <div className="hm-fut-top">
            <span className="hm-fut-rating gl-num"><b>{card.rating}</b><small>{card.ratingLabel}</small></span>
            <span className="hm-fut-pos">{card.position}</span>
          </div>
          <svg className="hm-fut-figure" viewBox="0 0 120 110" aria-hidden="true"><circle cx="60" cy="34" r="22" /><path d="M14 110c4-30 22-46 46-46s42 16 46 46Z" /></svg>
          <b className="hm-fut-name">{card.name}</b>
          <ul className="hm-fut-stats gl-num">{card.stats.map(stat => <li key={stat.label}><b>{stat.value}</b><small>{stat.label}</small></li>)}</ul>
          <ul className="hm-fut-facts gl-num">{card.facts.map(fact => <li key={fact.label}><small>{fact.label}</small><b>{fact.value}</b></li>)}</ul>
        </article>)}
      </div>
    </div>

    <div className="hm-ring-caption" aria-live={paused || reducedMotion ? 'polite' : 'off'}>
      <span className="hm-ring-step">{current.step}</span>
      <h2>{current.title}</h2>
      <p>{current.body}</p>
    </div>

    <div className="hm-ring-controls">
      <button type="button" className="hm-ring-btn" aria-label={labels.previous} onClick={() => setTurn(value => value - 1)}><ChevronLeft size={18} aria-hidden="true" /></button>
      <span className="hm-ring-dots" aria-hidden="true">{cards.map((card, index) => <i key={card.tier} className={index === active ? 'is-on' : ''} />)}</span>
      <button type="button" className="hm-ring-btn" aria-label={labels.next} onClick={() => setTurn(value => value + 1)}><ChevronRight size={18} aria-hidden="true" /></button>
      {!reducedMotion && <button type="button" className="hm-ring-btn" aria-label={paused ? labels.play : labels.pause} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}</button>}
    </div>
    <Link href={ctaHref} className="gl-btn gl-btn-primary hm-ring-cta">{labels.cta}<ArrowRight size={18} aria-hidden="true" /></Link>
  </section>
}
