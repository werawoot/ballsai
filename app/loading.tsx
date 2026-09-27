import { useTranslations } from 'next-intl'

// Shown by Next while a server-rendered route is still streaming. It fills only the page
// area: the root layout, and with it the bottom bar, stays on screen, so the tap that got
// us here is still visibly lit while this holds the space.
//
// It is a skeleton, not a spinner. The shapes stand where content will land -- a dark
// header, a hero, a column of cards in the editorial offset-shadow style the pages use --
// so the page arriving reads as the skeleton filling in rather than a screen swap.
export default function Loading() {
  const t = useTranslations('nav')
  return <div className="bds-route-skeleton" role="status" aria-live="polite">
    <span className="sr-only">{t('loading')}</span>
    <div className="bds-skel-header" aria-hidden="true">
      <span className="bds-skel-wordmark">BALLDOENSAI<em>.COM</em></span>
    </div>
    <div className="bds-skel-hero" aria-hidden="true">
      <i className="bds-skel-line is-eyebrow" />
      <i className="bds-skel-line is-title" />
      <i className="bds-skel-line is-title is-short" />
      <i className="bds-skel-line is-copy" />
    </div>
    <div className="bds-skel-body" aria-hidden="true">
      {[0, 1, 2].map(index => <div key={index} className="bds-skel-card" style={{ animationDelay: `${index * 90}ms` }}>
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
