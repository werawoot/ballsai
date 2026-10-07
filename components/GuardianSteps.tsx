import { useTranslations } from 'next-intl'

// The three steps of linking a parent to a child, in the order the system needs them. The
// same sentences appear on /guardian and on /welcome (lib/guardian-steps.ts).
export default function GuardianSteps({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const t = useTranslations('guardianSteps')
  const muted = tone === 'dark' ? 'rgba(255,255,255,.72)' : '#555'
  return <section aria-labelledby="guardian-steps-title" className="guardian-steps">
    <h2 id="guardian-steps-title" style={{ fontSize: 15, fontWeight: 800, margin: '0 0 8px' }}>{t('title')}</h2>
    <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6, color: muted, fontSize: 14, lineHeight: 1.55 }}>
      <li>{t('step1')}</li>
      <li>{t('step2')}</li>
      <li>{t('step3')}</li>
    </ol>
  </section>
}
