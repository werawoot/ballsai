import '@/app/brand-wordmark.css'

// The word before DOENSAI.com rolls down through the sports the site is for (owner, 24 Oct
// 2026), in English as the owner asked. Pure CSS, so it runs before any script loads; the
// moving words are decorative and the link around the wordmark carries the name.
export const SPORT_WORDS = ['Ball', 'Basket', 'Run', 'Futsal'] as const

export default function BrandWordmark() {
  return <span className="bw">
    <span className="bw-roll" aria-hidden="true">
      {SPORT_WORDS.map((word, index) => <span key={word} style={{ '--bw-i': index } as React.CSSProperties}>{word}</span>)}
    </span>
    <span>DOENSAI<em>.com</em></span>
  </span>
}
