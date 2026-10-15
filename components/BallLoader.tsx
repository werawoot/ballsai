// A football that turns while something loads (report 11, Phase 2). Pure SVG and CSS, no
// image or library; it stops turning when the device asks for reduced motion (app/ui.css).
export default function BallLoader({ size = 56 }: { size?: number }) {
  return <svg className="ui-ball" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <circle cx="32" cy="32" r="29" fill="#fff" stroke="#CC0001" strokeWidth="4" />
    <path d="M32 19l10 7.3-3.8 11.7H25.8L22 26.3z" fill="#CC0001" />
    <path d="M32 19V5M42 26.3l12.5-6M38.2 38l7.6 12M25.8 38l-7.6 12M22 26.3l-12.5-6" stroke="#CC0001" strokeWidth="3" strokeLinecap="round" fill="none" />
  </svg>
}
