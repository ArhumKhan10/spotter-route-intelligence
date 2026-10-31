import type { Route, RouteSummary } from './types'

export const riskOrder = (summary: RouteSummary) => [
  summary.eligible ? 0 : 1,
  summary.risk_miles[3],
  summary.risk_miles[2],
  summary.average_risk,
]

export function compareRisk(left: RouteSummary, right: RouteSummary) {
  const a = riskOrder(left),
    b = riskOrder(right)
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

export const miles = (value: number) =>
  value > 0 && value < 0.1 ? '<0.1' : value.toLocaleString(undefined, { maximumFractionDigits: 1 })

export function routeTradeoff(route: Route, routes: Route[]) {
  if (!route.summary.eligible || !routes.length) return null
  const fastest = routes.reduce((a, b) => (a.duration_seconds <= b.duration_seconds ? a : b))
  const eligible = routes.filter((candidate) => candidate.summary.eligible)
  if (eligible.length === 1 && routes.length > 1)
    return { text: 'Only eligible road', baseline: 'The other roads contain No Travel conditions.' }
  if (fastest.id === route.id)
    return {
      text:
        eligible.length > 1 &&
        eligible.every((candidate) => compareRisk(candidate.summary, route.summary) === 0)
          ? 'Same risk · fastest'
          : 'Lowest risk · fastest',
      baseline: 'Lowest ranked weather risk; driving time breaks weather ties.',
    }
  const extra = Math.round(route.duration_seconds / 60) - Math.round(fastest.duration_seconds / 60)
  const prefix = extra > 0 ? `+${extra} min` : 'Same drive time'
  let benefit = 'Lower average risk'
  if (!fastest.summary.eligible) benefit = 'Avoids No Travel'
  else {
    for (const level of [3, 2, 1]) {
      const difference = fastest.summary.risk_miles[level] - route.summary.risk_miles[level]
      if (difference > 0) {
        benefit = `${miles(difference)} ${['', 'Moderate', 'High', 'Severe'][level]} mi avoided`
        break
      }
    }
  }
  return {
    text: `${prefix} vs ${fastest.name.replace('Route ', '')} · ${benefit}`,
    baseline: `Compared with ${fastest.name}, the fastest road. ${benefit}.`,
  }
}
