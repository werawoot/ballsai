import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronRight, Dumbbell } from 'lucide-react'
import { say, type Program } from '@/lib/training/content'
import '@/app/training/training.css'

// Picking a programme on the athlete's home (docs/training-flow-v1.md): shown when there is no
// programme, or when the programmes there are have no session left. It names the programme that
// fits the athlete's age and holds the page's one primary button. Today's sessions themselves are
// the missions (app/profile/AthleteHome.tsx, third reference, owner 3 Nov 2026).
export default function TrainingCard({ recommended, age, finished = false }: { recommended: Program | null; age: number | null; finished?: boolean }) {
  const t = useTranslations('training')
  const p = useTranslations('profileHome')
  const locale = useLocale()
  return <section className="tr-today pf-card" aria-labelledby="tr-today-title">
    <div className="tr-today-empty">
      <Dumbbell size={28} aria-hidden="true" />
      <div>
        <h2 className="tr-today-title pf-card-title" id="tr-today-title">{finished ? p('pickAgain.title') : t('card.emptyTitle')}</h2>
        <p>{finished ? p('pickAgain.body') : t('card.emptyText')}</p>
        {recommended && age !== null && <p className="tr-reco">{t('card.recommended', { age, title: say(recommended.title, locale) })}</p>}
      </div>
    </div>
    <Link className="ui-btn ui-btn-primary" href={finished ? '/training?tab=programs' : '/training'}>{t('card.pickCta')}<ChevronRight size={18} aria-hidden="true" /></Link>
  </section>
}
