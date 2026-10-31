import { useState } from 'react'
import { ArrowRight, ShieldCheck } from '@phosphor-icons/react'
import RiskBar from './RiskBar'
import { city, COLORS, duration, LABELS, number } from '../types'
import type { Plan } from '../types'
import { miles } from '../routeInsights'

export default function RouteComparison({
  plan,
  onSelect,
}: {
  plan: Plan
  onSelect: (id: string) => void
}) {
  const [all, setAll] = useState(false)
  const shown = LABELS.map((_, index) => index).filter(
    (index) => all || plan.routes.some((route) => route.summary.risk_miles[index] > 0),
  )
  return (
    <>
      <p className="result-summary">
        {city(plan.trip.origin.name)} to {city(plan.trip.destination.name)} ·{' '}
        {number(plan.trip.load_lb)} lb ·{' '}
        {plan.mode === 'demo' ? 'Simulated weather' : 'Live forecast'}
      </p>
      <div className="comparison-toolbar">
        <span>Weather exposure by road</span>
        <button className="text-button" aria-pressed={all} onClick={() => setAll(!all)}>
          {all ? 'Hide shared zeros' : 'Show all risk bands'}
        </button>
      </div>
      <div className="comparison-grid">
        {plan.routes.map((route) => {
          const fastest = Math.min(...plan.routes.map((r) => Math.round(r.duration_seconds / 60)))
          const extra = Math.round(route.duration_seconds / 60) - fastest
          return (
            <div
              className={`comparison-route ${route.id === plan.recommended_id ? 'best' : ''}`}
              key={route.id}
            >
              <span className="comparison-label">
                {!route.summary.eligible ? (
                  'No Travel'
                ) : route.id === plan.recommended_id ? (
                  <>
                    <ShieldCheck size={15} />
                    Recommended
                  </>
                ) : (
                  'Alternative'
                )}
              </span>
              <h3>{route.name}</h3>
              <p>{route.road_name}</p>
              <strong>{duration(route.duration_seconds)}</strong>
              <span className="comparison-delta">
                {extra ? `+${extra} min vs fastest` : 'Fastest road'} ·{' '}
                {number(route.distance_miles)} mi
              </span>
              <RiskBar route={route} large />
              <dl>
                {shown.map((level) => {
                  const values = plan.routes.map((r) => r.summary.risk_miles[level])
                  const differs = Math.max(...values) - Math.min(...values) > 0.05
                  return (
                    <div className={differs ? 'comparison-difference' : ''} key={level}>
                      <dt>
                        <i style={{ background: COLORS[level] }} />
                        {LABELS[level]}
                      </dt>
                      <dd>{miles(route.summary.risk_miles[level])} mi</dd>
                    </div>
                  )
                })}
                <div>
                  <dt>Average risk</dt>
                  <dd>{route.summary.average_risk.toFixed(2)} / 4</dd>
                </div>
              </dl>
              <button className="primary" onClick={() => onSelect(route.id)}>
                View this route <ArrowRight size={15} />
              </button>
            </div>
          )
        })}
      </div>
      <p className="small-note">
        {all ? 'All risk bands are shown.' : 'Shared zero-mile bands are hidden.'} Route risk is
        estimated between checkpoints.
      </p>
    </>
  )
}
