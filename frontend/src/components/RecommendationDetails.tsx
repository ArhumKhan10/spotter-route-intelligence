import { ArrowRight, ArrowUpRight, Check } from '@phosphor-icons/react'
import { compareRisk, miles } from '../routeInsights'
import { city, duration, LABELS, number } from '../types'
import type { Plan } from '../types'
import RiskBar from './RiskBar'

export default function RecommendationDetails({
  plan,
  onRules,
}: {
  plan: Plan
  onRules: () => void
}) {
  const best = plan.routes.find((route) => route.id === plan.recommended_id)
  if (!best) return null
  const eligible = plan.routes.filter((route) => route.summary.eligible)
  const fastest = [...plan.routes].sort((a, b) => a.duration_seconds - b.duration_seconds)[0]
  const baseline =
    fastest.id !== best.id
      ? fastest
      : [...plan.routes]
          .filter((route) => route.id !== best.id)
          .sort((a, b) => a.duration_seconds - b.duration_seconds)[0]
  const tied =
    eligible.length > 1 && eligible.every((route) => compareRisk(route.summary, best.summary) === 0)
  const extra = Math.round(best.duration_seconds / 60) - Math.round(fastest.duration_seconds / 60)
  let headline = 'Lowest ranked weather risk'
  let reason = 'Severe miles come first, then High miles, average risk, and driving time.'
  if (eligible.length === 1 && plan.routes.length > 1) {
    headline = 'Only road without No Travel conditions'
    reason = 'The other roads are excluded by the weather and load rules.'
  } else if (tied) {
    headline = 'Weather risk is tied. Driving time wins.'
    reason = `${best.name} is the fastest eligible road for this departure and load.`
  } else if (baseline && baseline.id !== best.id) {
    for (const level of [3, 2]) {
      const avoided = baseline.summary.risk_miles[level] - best.summary.risk_miles[level]
      if (avoided > 0) {
        headline = `${miles(avoided)} ${LABELS[level]}-risk miles avoided`
        reason =
          extra > 0
            ? `${extra} minutes longer than the fastest route, ${fastest.name}.`
            : `${best.name} also has the fastest driving time.`
        break
      }
    }
  }
  const rows = baseline ? [best, baseline] : [best]
  const bands = rows.some((route) => !route.summary.eligible) ? [4, 3, 2] : [3, 2]
  const departure = new Date(plan.trip.departure).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
  return (
    <section className="recommendation-evidence" aria-label="Recommendation explanation">
      <div className="result-trip-context">
        <span className={`result-source ${plan.mode}`}>
          {plan.mode === 'demo' ? 'Simulated weather' : 'Live forecast'}
        </span>
        <span>
          {number(plan.trip.load_lb)} lb · Every {plan.trip.interval_miles} mi
        </span>
      </div>
      <p className="result-cities">
        {city(plan.trip.origin.name)} <ArrowRight size={14} /> {city(plan.trip.destination.name)}
      </p>
      <p className="result-departure">Depart {departure}</p>
      <h3>{best.name} is recommended</h3>
      <p className="recommendation-headline">{headline}</p>
      <p>{reason}</p>
      <div className="evidence-table-scroll">
        <table className="evidence-table">
          <thead>
            <tr>
              <th>Road / weather exposure</th>
              <th>Drive</th>
              {bands.map((level) => (
                <th key={level}>{LABELS[level]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((route) => (
              <tr className={route.id === best.id ? 'recommended-row' : ''} key={route.id}>
                <th scope="row">
                  <span>
                    {route.name}
                    {route.id === best.id ? (
                      <Check size={14} />
                    ) : (
                      <small>{route.id === fastest.id ? 'Fastest road' : 'Alternative'}</small>
                    )}
                  </span>
                  <RiskBar route={route} />
                  <small>
                    {route.summary.eligible ? LABELS[route.summary.max_risk] : 'No Travel'}
                  </small>
                </th>
                <td>{duration(route.duration_seconds)}</td>
                {bands.map((level) => (
                  <td key={level}>{miles(route.summary.risk_miles[level])} mi</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {best.summary.max_risk === 0 && (
        <p className="evidence-clear-note">
          All {miles(best.distance_miles)} miles on {best.name} are Low risk in these forecasts.
        </p>
      )}
      <button className="text-button" onClick={onRules}>
        View the risk rules <ArrowUpRight size={14} />
      </button>
    </section>
  )
}
