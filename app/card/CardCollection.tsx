import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Lock } from 'lucide-react'
import type { CollectionCard, Rarity } from '@/lib/card-collection'

// The card collection on /card (owner, 3 Nov 2026): every version is earned by a recorded result
// (lib/card-collection.ts). An earned card shows the athlete and when it was earned; a locked one
// says what earns it, so the collection is also the list of goals.

export function CollectionTile({ card, name, initials, photo }: { card: CollectionCard; name: string; initials: string; photo: string | null }) {
  const t = useTranslations('card.collection')
  const badges = useTranslations('careerPage.badges')
  const locale = useLocale()
  const earned = card.kind === 'season' ? Boolean(card.season) : Boolean(card.earnedAt)
  const title = card.kind === 'season'
    ? card.season ? t('seasonName', { season: card.season }) : t('seasonLocked')
    : badges(`${card.badge!}.name`)
  const how = card.kind === 'season' ? t('seasonHow') : badges(`${card.badge!}.description`)
  const date = card.earnedAt ? new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(card.earnedAt)) : null
  return <li className={`cd-tile is-${card.rarity}${earned ? '' : ' is-locked'}`}>
    <span className="cd-tile-face" aria-hidden="true">
      <span className="cd-tile-rarity">{t(`rarities.${card.rarity}`)}</span>
      <span className="cd-tile-photo" style={earned && photo ? { backgroundImage: `url("${photo}")` } : undefined}>{earned ? (!photo && initials) : <Lock size={22} />}</span>
      <span className="cd-tile-name">{earned ? name : '?'}</span>
    </span>
    <span className="cd-tile-text">
      <b>{title}</b>
      <small>{earned ? (date ? t('earnedOn', { date }) : t('earned')) : how}</small>
      <span className="cd-sr">{t(`rarities.${card.rarity}`)} · {earned ? t('earned') : t('locked')}</span>
    </span>
  </li>
}

export function RarityFilter({ counts, active, href }: { counts: Record<Rarity | 'all', number>; active: Rarity | 'all'; href: (rarity: Rarity | 'all') => string }) {
  const t = useTranslations('card.collection')
  return <nav className="cd-rarities" aria-label={t('filterLabel')}>
    {(['all', 'common', 'rare', 'special', 'legend'] as const).map(key => <Link key={key} href={href(key)} className={`cd-rarity is-${key}${active === key ? ' is-on' : ''}`} aria-current={active === key ? 'true' : undefined} scroll={false}>
      <span>{key === 'all' ? t('all') : t(`rarities.${key}`)}</span><b>{counts[key]}</b>
    </Link>)}
  </nav>
}
