import Link from 'next/link'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { ArrowLeft, ArrowUpRight, Bandage, Check, ClipboardList, Flag, IdCard, Lock, Medal, ShieldCheck, Trash2, Trophy, UserRound, UsersRound } from 'lucide-react'
import { drillImage } from '@/lib/training/content'
import './impact.css'

// Worded by impact.* in messages/*.json. Every promise on this page must already be true in
// the app without a pending SQL file: parents read it before they trust us with a child.
const ROLES = [
  { key: 'athlete', href: '/card', icon: <UserRound size={24} />, tone: 'red' },
  { key: 'guardian', href: '/guardian', icon: <ShieldCheck size={24} />, tone: 'green' },
  { key: 'coach', href: '/team-members', icon: <ClipboardList size={24} />, tone: 'blue' },
  { key: 'organizer', href: '/dashboard', icon: <Flag size={24} />, tone: 'gold' },
] as const
const ROLE_POINTS = ['a', 'b', 'c'] as const
const STEPS = ['profile', 'play', 'grow'] as const
const SAFETY = [
  { key: 'consent', icon: <UsersRound size={21} /> },
  { key: 'private', icon: <Lock size={21} /> },
  { key: 'health', icon: <Bandage size={21} /> },
  { key: 'delete', icon: <Trash2 size={21} /> },
] as const
const LEVELS = [
  { key: 'self', chip: 'is-self' },
  { key: 'coach', chip: 'is-coach' },
  { key: 'performance', chip: 'is-performance' },
] as const
const FEATURES = [
  { key: 'card', href: '/card', art: <IdCard size={44} strokeWidth={1.5} />, tone: 'red' },
  { key: 'training', href: '/training', image: 'b2-cone-gates', tone: 'pitch' },
  { key: 'tournaments', href: '/tournaments', art: <Trophy size={44} strokeWidth={1.5} />, tone: 'ink' },
  { key: 'ranking', href: '/ranking', art: <Medal size={44} strokeWidth={1.5} />, tone: 'gold' },
] as const
const FAQ = ['who', 'rating', 'training', 'delete'] as const

// Not async on purpose, like PageHeader: useTranslations works in a server component.
export default function ImpactPage() {
  const t = useTranslations('impact')
  return (
    <main className="impact-page">
      <header className="impact-header">
        <Link href="/" className="impact-back"><ArrowLeft size={17} /> {t('back')}</Link>
        <Link href="/" className="impact-logo"><span className="bds-brand-mark"><Trophy size={14} /></span>BallDoenSai.com</Link>
        <Link href="/athletes" className="impact-directory">{t('directory')} <ArrowUpRight size={15} /></Link>
      </header>

      <section className="im-hero">
        <div className="im-wrap im-hero-grid">
          <div>
            <p className="im-eyebrow">{t('eyebrow')}</p>
            <h1>{t('hero.line1')}<br />{t('hero.line2')}<em>{t('hero.line3')}</em></h1>
            <p className="im-lead">{t('hero.body')}</p>
            <div className="im-ctas">
              <Link href="/profile" className="im-btn im-btn-primary">{t('action.create')} <ArrowUpRight size={18} /></Link>
              <Link href="/athletes" className="im-btn im-btn-ghost">{t('action.browse')}</Link>
            </div>
            <ul className="im-trust">
              {(['consent', 'source', 'delete'] as const).map(key => <li key={key}><Check size={13} strokeWidth={3} />{t(`trust.${key}`)}</li>)}
            </ul>
          </div>
          <div className="im-hero-art" aria-hidden="true">
            <div className="im-hero-plate" />
            <Image alt="" height={340} src={drillImage('d4-striking')} unoptimized width={340} />
            <span className="im-hero-tag im-hero-tag-one"><i className="is-green" />{t('heroTags.verified')}</span>
            <span className="im-hero-tag im-hero-tag-two"><i className="is-red" />{t('heroTags.rating')}</span>
          </div>
        </div>
      </section>

      <section className="im-section">
        <div className="im-wrap">
          <div className="im-head"><p className="im-eyebrow">{t('roles.eyebrow')}</p><h2>{t('roles.title')}</h2><p>{t('roles.body')}</p></div>
          <div className="im-roles">
            {ROLES.map(role => <article key={role.key} className="im-card im-role">
              <span className={`im-role-icon is-${role.tone}`}>{role.icon}</span>
              <h3>{t(`roles.${role.key}.title`)}</h3>
              <ul>{ROLE_POINTS.map(point => <li key={point}><Check size={15} strokeWidth={3} />{t(`roles.${role.key}.${point}`)}</li>)}</ul>
              <Link href={role.href} className="im-role-link">{t(`roles.${role.key}.link`)} <ArrowUpRight size={15} /></Link>
            </article>)}
          </div>
        </div>
      </section>

      <section className="im-section im-section-tight">
        <div className="im-wrap">
          <div className="im-head"><p className="im-eyebrow">{t('steps.eyebrow')}</p><h2>{t('steps.title1')} <span className="im-nowrap">{t('steps.title2')}</span></h2></div>
          <ol className="im-steps">
            {STEPS.map((step, index) => <li key={step} className="im-card im-step">
              <span className="im-step-number" aria-hidden="true">{index + 1}</span>
              <div><h3>{t(`steps.${step}.title`)}</h3><p>{t(`steps.${step}.copy`)}</p></div>
            </li>)}
          </ol>
        </div>
      </section>

      <section className="im-section im-safety">
        <div className="im-wrap">
          <div className="im-head"><p className="im-eyebrow is-green">{t('safety.eyebrow')}</p><h2>{t('safety.title')}</h2><p>{t('safety.body')}</p></div>
          <div className="im-safety-grid">
            {SAFETY.map(item => <div key={item.key} className="im-safety-item">
              <span className="im-safety-icon">{item.icon}</span>
              <div><h3>{t(`safety.${item.key}.title`)}</h3><p>{t(`safety.${item.key}.copy`)}</p></div>
            </div>)}
          </div>
          <div className="im-levels">
            <h3>{t('levels.title')}</h3>
            <p>{t('levels.body')}</p>
            <div className="im-levels-grid">
              {LEVELS.map(level => <div key={level.key} className="im-level">
                <span className={`ui-chip ${level.chip}`}>{t(`levels.${level.key}.chip`)}</span>
                <p><b>{t(`levels.${level.key}.who`)}</b> {t(`levels.${level.key}.copy`)}</p>
              </div>)}
            </div>
          </div>
        </div>
      </section>

      <section className="im-section">
        <div className="im-wrap">
          <div className="im-head"><p className="im-eyebrow">{t('features.eyebrow')}</p><h2>{t('features.title')}</h2></div>
          <div className="im-features">
            {FEATURES.map(feature => <Link key={feature.key} href={feature.href} className="im-card im-feature">
              <span className={`im-feature-art is-${feature.tone}`} aria-hidden="true">
                {'image' in feature ? <Image alt="" fill sizes="(max-width: 760px) 100vw, 280px" src={drillImage(feature.image)} unoptimized /> : feature.art}
              </span>
              <span className="im-feature-body">
                {feature.key === 'training' && <span className="im-new">{t('features.new')}</span>}
                <b>{t(`features.${feature.key}.title`)}</b>
                <span>{t(`features.${feature.key}.copy`)}</span>
              </span>
            </Link>)}
          </div>
        </div>
      </section>

      <section className="im-section im-section-tight im-faq">
        <div className="im-wrap">
          <div className="im-head"><p className="im-eyebrow">{t('faq.eyebrow')}</p><h2>{t('faq.title')}</h2></div>
          {FAQ.map((item, index) => <details key={item} open={index === 0}>
            <summary>{t(`faq.${item}.q`)}</summary>
            <p>{t(`faq.${item}.a`)}</p>
          </details>)}
        </div>
      </section>

      <section className="im-action">
        <div className="im-wrap">
          <p className="im-eyebrow is-gold">{t('action.eyebrow')}</p>
          <h2>{t('action.title1')}<br /><em>{t('action.title2')}</em></h2>
          <p>{t('action.body')}</p>
          <div className="im-ctas">
            <Link href="/profile" className="im-btn im-btn-primary">{t('action.create')} <ArrowUpRight size={18} /></Link>
            <Link href="/athletes" className="im-btn im-btn-ghost">{t('action.browse')}</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
