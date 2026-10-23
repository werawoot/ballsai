import { useTranslations } from 'next-intl'
import BrandMark from '@/components/BrandMark'
import { glassSceneStyle } from '@/lib/stock-photos'
import './glass.css'

// The one route skeleton, shown while any page loads. It stands on the light glass design
// (ADR-014) with the site's brand mark, so moving between glass pages never flashes the old
// dark bar; the shapes are neutral enough for a page not yet moved. Being in the root
// segment, it puts glass.css (every rule scoped to .gl) in the CSS every route loads.
export default function Loading() {
  const t = useTranslations('nav')
  return <div className="bds-route-skeleton gl gl-scene" style={glassSceneStyle(null)} role="status" aria-live="polite">
    <span className="sr-only">{t('loading')}</span>
    <div className="bds-skel-header" aria-hidden="true">
      <BrandMark size={26} /><span className="bds-skel-name">BallDoenSai.com</span>
    </div>
    <div className="bds-skel-hero" aria-hidden="true">
      <i className="bds-skel-line is-eyebrow" />
      <i className="bds-skel-line is-title" />
      <i className="bds-skel-line is-title is-short" />
      <i className="bds-skel-line is-copy" />
    </div>
    <div className="bds-skel-body" aria-hidden="true">
      {[0, 1, 2].map(index => <div key={index} className="bds-skel-card gl-card" style={{ animationDelay: `${index * 90}ms` }}>
        <i className="bds-skel-avatar" />
        <div className="bds-skel-card-text">
          <i className="bds-skel-line is-card-title" />
          <i className="bds-skel-line is-card-meta" />
        </div>
        <i className="bds-skel-stat" />
      </div>)}
    </div>
  </div>
}
