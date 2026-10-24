// The one brand mark (owner's DOENSAI logo, 24 Oct 2026; ADR-014): the green and white "D" on
// its dark rounded square, beside "DOENSAI.com". Decorative; the link around it carries the name.
export default function BrandMark({ size = 24 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="bds-brand-mark" src="/brand/doensai-mark.webp" width={size} height={size} alt="" aria-hidden="true" decoding="async" />
}
