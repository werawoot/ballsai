// The name on a Player Card: one line when it fits, two balanced lines when it does not,
// never cut with an ellipsis. The screen card wraps it with CSS; the shared image is drawn
// on a canvas and uses this to choose the lines (app/card/card-export.ts).
export function cardNameLines(name: string, fitsOneLine: boolean): string[] {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (fitsOneLine || words.length < 2) return [words.join(' ')]
  const total = words.join(' ').length
  let best = 1
  let bestGap = Infinity
  for (let cut = 1; cut < words.length; cut++) {
    const gap = Math.abs(words.slice(0, cut).join(' ').length - total / 2)
    if (gap < bestGap) { best = cut; bestGap = gap }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')]
}
