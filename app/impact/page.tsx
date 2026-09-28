import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowLeft, ArrowUpRight, BadgeCheck, Eye, Flag, MapPinned, PlayCircle, Sparkles, Target, Trophy, UsersRound } from 'lucide-react'

// Worded by impact.path.<key>.title / .copy in messages/*.json.
const impactSteps = [
  { number: '01', key: 'see', icon: <Eye size={25} /> },
  { number: '02', key: 'connect', icon: <MapPinned size={25} /> },
  { number: '03', key: 'grow', icon: <Target size={25} /> },
] as const

// Not async on purpose, like PageHeader: useTranslations works in a server component.
export default function ImpactPage() {
  const t = useTranslations('impact')
  return (
    <main className="impact-page">
      <header className="impact-header">
        <Link href="/" className="impact-back"><ArrowLeft size={17} /> {t('back')}</Link>
        <Link href="/" className="impact-logo"><span><Trophy size={15} /></span>BallDoenSai.com</Link>
        <Link href="/athletes" className="impact-directory">Athlete Database <ArrowUpRight size={15} /></Link>
      </header>

      <section className="impact-hero">
        <div className="impact-hero-grid" />
        <div className="impact-star impact-star-one" /><div className="impact-star impact-star-two" /><div className="impact-star impact-star-three" />
        <div className="impact-hero-copy">
          <span className="impact-label"><Sparkles size={13} /> WHY BALLDOENSAI.COM EXISTS</span>
          <h1>{t('hero.line1')}<br />{t('hero.line2')}<br /><em>{t('hero.line3')}</em></h1>
          <p>{t('hero.body')}</p>
        </div>
        <div className="impact-hero-number" aria-hidden="true">01</div>
        <div className="impact-hero-note"><span>THE MISSION</span><b>MAKE TALENT<br />VISIBLE</b></div>
      </section>

      <section className="impact-statement">
        <div className="impact-statement-mark">“</div>
        <p>{t('statement.line1')}<br />{t('statement.before')}<strong>{t('statement.strong')}</strong>{t('statement.after')}<br />{t('statement.line3')}</p>
        <div className="impact-statement-line" />
      </section>

      <section className="impact-path">
        <div className="impact-path-heading">
          <span className="impact-label">THE IMPACT PATH</span>
          <h2>{t('path.title1')}<br />{t('path.title2')}</h2>
          <p>{t('path.body')}</p>
        </div>
        <div className="impact-path-map">
          <div className="impact-path-line" />
          {impactSteps.map((step, index) => <article key={step.number} className={`impact-step impact-step-${index + 1}`}>
            <div className="impact-step-node"><span>{step.number}</span></div>
            <div className="impact-step-card">
              <div className="impact-step-icon">{step.icon}</div>
              <span>{step.number} / 03</span><h3>{t(`path.${step.key}.title`)}</h3><p>{t(`path.${step.key}.copy`)}</p>
            </div>
          </article>)}
        </div>
      </section>

      <section className="impact-outcomes">
        <div className="impact-outcomes-header"><span className="impact-label">WHAT WE WANT TO UNLOCK</span><h2>{t('outcomes.title1')}<br />{t('outcomes.title2')}</h2></div>
        <div className="impact-outcome-grid">
          <div className="impact-outcome impact-outcome-red"><BadgeCheck size={30} /><b>{t('outcomes.profile.line1')}<br />{t('outcomes.profile.line2')}</b><p>{t('outcomes.profile.body')}</p></div>
          <div className="impact-outcome impact-outcome-navy"><PlayCircle size={30} /><b>{t('outcomes.story.line1')}<br />{t('outcomes.story.line2')}</b><p>{t('outcomes.story.body')}</p></div>
          <div className="impact-outcome impact-outcome-green"><UsersRound size={30} /><b>{t('outcomes.community.line1')}<br />{t('outcomes.community.line2')}</b><p>{t('outcomes.community.body')}</p></div>
        </div>
      </section>

      <section className="impact-action">
        <div><span className="impact-label">START WITH ONE PROFILE</span><h2>{t('action.title1')}<br /><em>{t('action.title2')}</em></h2></div>
        <div className="impact-action-buttons"><Link href="/profile" className="impact-primary">{t('action.create')} <ArrowUpRight size={18} /></Link><Link href="/athletes" className="impact-secondary">{t('action.browse')}</Link></div>
        <Flag className="impact-flag" size={112} strokeWidth={.8} aria-hidden="true" />
      </section>
    </main>
  )
}
