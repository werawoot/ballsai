import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import PageHeader from '@/components/PageHeader'
import { drillImage, findDrill, say } from '@/lib/training/content'
import '../../training.css'

// One exercise: our own picture, how to do it, and its full provenance (rule 1): the
// study, the licence, what we changed, the picture's origin and when the licence was checked.
export default async function DrillPage(props: { params: Promise<{ drillId: string }> }) {
  const { drillId } = await props.params
  const found = findDrill(drillId)
  if (!found) notFound()
  const { program, drill, source } = found
  const [t, locale] = await Promise.all([getTranslations('training'), getLocale()])

  return (
    <main className="bds-page tr ui-matchday">
      <PageHeader back={{ href: `/training/${program.id}`, label: say(program.title, locale) }} />
      <div className="tr-wrap tr-session">
        <div className="tr-drill-img">
          <Image alt={say(drill.name, locale)} fill priority sizes="(max-width: 640px) 100vw, 640px" src={drillImage(drill.id)} unoptimized />
          <small>{t('drill.picture')}</small>
        </div>
        <div className="tr-chips" style={{ marginTop: 12 }}>
          <span className={`ui-chip ${drill.access === 'solo' ? 'is-coach' : 'is-self'}`}>{t(`access.${drill.access}`)}</span>
          <span className="ui-chip is-warn">{t('draft')}</span>
        </div>
        <h1 className="ui-h1" style={{ marginTop: 8 }}>{say(drill.name, locale)}</h1>
        <dl className="ui-card tr-kv" style={{ marginTop: 12 }}>
          <dt>{t('drill.how')}</dt><dd style={{ fontWeight: 600 }}>{say(drill.how, locale)}</dd>
          <dt>{t('drill.dose')}</dt><dd>{say(drill.dose, locale)}</dd>
        </dl>
        <p className="tr-rule">{t('painStop')}</p>

        {source && <section className="tr-section">
          <h2>{t('sourcesTitle')}</h2>
          <dl className="ui-card tr-kv">
            <dt>{t('drill.study')}</dt><dd>{source.title}<br /><small style={{ fontWeight: 600 }}>{source.author}</small></dd>
            <dt>{t('drill.license')}</dt><dd>{source.license}</dd>
            <dt>{t('drill.whatWeDid')}</dt><dd style={{ fontWeight: 600 }}>{source.attribution}</dd>
            <dt>{t('drill.media')}</dt><dd style={{ fontWeight: 600 }}>{t('drill.mediaValue')}</dd>
            <dt>{t('drill.evidence')}</dt><dd style={{ fontWeight: 600 }}>{source.evidenceLevel}</dd>
            <dt>{t('drill.verified')}</dt><dd>{source.licenseVerifiedAt}</dd>
            <dt>{t('drill.method')}</dt><dd style={{ fontWeight: 600 }}>{source.licenseVerificationMethod}</dd>
          </dl>
          <a className="ui-btn ui-btn-ghost ui-btn-sm" href={source.url} rel="noreferrer" style={{ marginTop: 10 }} target="_blank">{t('drill.open')} ↗</a>
          <p className="tr-official">{t('notOfficial')}</p>
        </section>}
      </div>
    </main>
  )
}
