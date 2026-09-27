// A venue court's sport code worded for the reader. Known codes come from
// messages/*.json (venues.sport.*); anything else shows as stored rather than blank.
const KNOWN = ['football', 'futsal'] as const
type KnownSport = (typeof KNOWN)[number]

export function sportName(code: string, t: (key: `sport.${KnownSport}`) => string): string {
  return (KNOWN as readonly string[]).includes(code) ? t(`sport.${code as KnownSport}`) : code
}
