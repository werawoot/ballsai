import { Trophy } from 'lucide-react'

// The one brand mark (docs/design-system.md): the home page's red slanted square with the
// trophy, beside "BallDoenSai.com". Decorative; the link around it carries the name.
export default function BrandMark({ size = 24 }: { size?: number }) {
  return <i className="bds-brand-mark" style={{ width: size, height: size }} aria-hidden="true">
    <Trophy size={Math.round(size * 0.58)} />
  </i>
}
