// The last eight weeks of check-ins as bars, read by screen readers through hidden text. Shared
// by /progress (the athlete) and /guardian/[athleteId]/progress (an accepted guardian).

type Week = { monday: string; sessions: number }

export default function WeeksChart({ weeks, label, shortDate }: { weeks: Week[]; label: (date: string, count: number) => string; shortDate: Intl.DateTimeFormat }) {
  const most = Math.max(1, ...weeks.map(week => week.sessions))
  return <ol className="pg-weeks">
    {weeks.map(week => {
      const date = shortDate.format(new Date(`${week.monday}T00:00:00Z`))
      return <li key={week.monday}>
        <span className="sr-only">{label(date, week.sessions)}</span>
        <span className="pg-bar" aria-hidden="true"><i style={{ height: `${Math.round(week.sessions / most * 100)}%` }} /></span>
        <b aria-hidden="true">{week.sessions}</b>
        <small aria-hidden="true">{date}</small>
      </li>
    })}
  </ol>
}
