import { useTranslations } from 'next-intl'
import { HelpCircle } from 'lucide-react'

// "What do the card and the numbers mean?" for /card and /profile. Closed until tapped, so the
// card stays the first thing on screen. Every rule here is the one the system applies:
// lib/rating.ts (power), sql/digital-identity-v1.sql (XP, levels, badges), lib/player-card.ts
// (provenance). Change the text in messages/*.json when one of those changes.
const SECTIONS = ['starter', 'power', 'xp', 'badges', 'skills', 'source'] as const

export default function CardGuide({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const t = useTranslations('cardGuide')
  const dark = tone === 'dark'
  return <details style={{
    borderRadius: 14, border: `1px solid ${dark ? 'rgba(255,255,255,.14)' : '#e5e7eb'}`,
    background: dark ? 'rgba(255,255,255,.04)' : 'white', color: dark ? 'rgba(255,255,255,.86)' : '#1f2937',
    padding: '0 14px', margin: '14px 0 0',
  }}>
    <summary style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
      <HelpCircle size={17} aria-hidden="true" style={{ flex: 'none', color: dark ? '#f5c518' : '#CC0001' }} />{t('summary')}
    </summary>
    <dl style={{ margin: '0 0 14px', display: 'grid', gap: 12 }}>
      {SECTIONS.map(key => <div key={key}>
        <dt style={{ fontSize: 13, fontWeight: 800, marginBottom: 2 }}>{t(`${key}.title`)}</dt>
        <dd style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: dark ? 'rgba(255,255,255,.68)' : '#4b5563' }}>{t(`${key}.text`)}</dd>
      </div>)}
    </dl>
  </details>
}
