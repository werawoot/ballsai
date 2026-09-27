import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft, Trophy } from 'lucide-react'

// The one top bar for content pages. Before it there were nine hand-written headers
// across 35 pages -- four spellings of the logo, back buttons 15-17px tall labelled only
// "กลับ", and six pages with no header at all. The home page keeps its own editorial
// header (AGENTS.md rule 7), as do the four pages with designed identity headers
// (card, career, hall-of-fame, impact); task flows (login, welcome) have none.
//
// Deliberately static, not sticky: several pages set `overflow-x: hidden` on <main>,
// which would silently defeat `position: sticky`, and a phone already gives up 66px to
// the bottom bar.

export type PageHeaderBack = {
  /**
   * A fixed destination, never `history.back()`: someone who arrived from a shared link
   * or a notification has no history in this app, and "back" would leave the site.
   */
  href: string
  /** Names where it goes. The visible label is the destination, not the word "กลับ". */
  label: string
}

export default function PageHeader({ back, eyebrow, actions }: {
  back?: PageHeaderBack
  /** A short section label shown on the right when there are no actions. */
  eyebrow?: string
  actions?: ReactNode
}) {
  return <header className={`bds-page-header${actions ? ' has-actions' : ''}`}>
    {back
      ? <Link href={back.href} className="bds-page-header-back" aria-label={`กลับไป${back.label}`}>
          <ArrowLeft size={20} aria-hidden="true" />
          <span>{back.label}</span>
        </Link>
      : <Link href="/" className="bds-page-header-brand" aria-label="BallDoenSai.com หน้าแรก">
          <Trophy size={20} aria-hidden="true" />
          <span>BallDoenSai<em>.com</em></span>
        </Link>}
    {actions
      ? <div className="bds-page-header-actions">{actions}</div>
      : eyebrow ? <span className="bds-page-header-eyebrow">{eyebrow}</span> : null}
  </header>
}
