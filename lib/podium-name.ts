// A podium card on /ranking is ~80px wide on a 320px phone. The name used to be cut to
// "ณัฐวุฒิ ศรี…"; now the first name and the rest each get a line, so the break falls
// between them rather than wherever the browser's Thai dictionary splits a surname.
// A part still too wide for its line wraps inside it (overflow-wrap:anywhere on the
// element), so a name is never cut off.
export function podiumNameLines(name: string): string[] {
  const trimmed = name.trim()
  const space = trimmed.search(/\s/)
  return space === -1 ? [trimmed] : [trimmed.slice(0, space), trimmed.slice(space + 1).trim()]
}
