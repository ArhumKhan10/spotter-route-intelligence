import { ArrowRight, Check } from '@phosphor-icons/react'
import { compareRisk, miles } from '../routeInsights'
import { city, LABELS, number, time } from '../types'
import type { DepartureOption, Plan, Route } from '../types'

export default function DepartureComparison({
  route,
  demo,
  loading,
  onApply,
  trip,
}: {
  route: Route
  demo: boolean
  loading: boolean
  onApply: (option: DepartureOption) => void
  trip: Plan['trip']
}) {
  const options = route.departures || []
  const evaluated = options.filter(
    (option): option is DepartureOption & { available: true } => option.available,
  )
  const available = evaluated.filter(
    (option): option is DepartureOption & { available: true } =>
      option.available && option.summary.eligible,
  )
  const best = [...available].sort(
    (a, b) => compareRisk(a.summary, b.summary) || a.offset_hours - b.offset_hours,
  )[0]
  const changed =
    evaluated.length > 1 &&
    evaluated.some((option) => compareRisk(option.summary, evaluated[0].summary) !== 0)
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
  return (
    <div className="departure-comparison">
      <p className="departure-context">
        {city(trip.origin.name)} to {city(trip.destination.name)} · {number(trip.load_lb)} lb ·{' '}
        {route.name} · {demo ? 'Simulated weather' : 'Live forecast'}
      </p>
      <div className="departure-table-scroll">
        <table className="departure-table">
          <thead>
            <tr>
              <th>Departure</th>
              <th>Arrival</th>
              <th>Severe / High</th>
              <th>Risk</th>
              <th>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {options.map((option) => (
              <tr
                className={best === option && changed ? 'best-departure' : ''}
                key={option.offset_hours}
              >
                <th scope="row">
                  <strong>
                    {option.offset_hours ? `+${option.offset_hours} hours` : 'Current start'}
                  </strong>
                  <span>
                    {date(option.departure)} · {time(option.departure)}
                  </span>
                </th>
                <td data-label="Arrival">
                  <strong>{time(option.arrival)}</strong>
                  <span>{date(option.arrival)}</span>
                </td>
                {option.available ? (
                  <>
                    <td data-label="Severe / High miles">
                      {miles(option.summary.risk_miles[3])} / {miles(option.summary.risk_miles[2])}{' '}
                      <span>mi</span>
                    </td>
                    <td data-label="Risk">
                      <span className={`departure-risk risk-${option.summary.max_risk}`}>
                        {option.summary.eligible ? LABELS[option.summary.max_risk] : 'No Travel'}
                      </span>
                      <span className="departure-average">
                        Avg {option.summary.average_risk.toFixed(2)} / 4
                      </span>
                      {best === option && changed && (
                        <span className="departure-best">
                          <Check size={13} />
                          Best weather
                        </span>
                      )}
                    </td>
                  </>
                ) : (
                  <td colSpan={2} className="departure-unavailable">
                    {option.reason}
                  </td>
                )}
                <td>
                  {option.offset_hours === 0 ? (
                    <span className="departure-current">Current</span>
                  ) : (
                    <button
                      className="text-button"
                      aria-label={`Plan departure ${option.offset_hours} hours later`}
                      disabled={loading || !option.available}
                      onClick={() => onApply(option)}
                    >
                      Use time <ArrowRight size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!options.length ? (
        <p>Refresh the trip to compare departure times.</p>
      ) : (
        <p className="small-note">
          {!available.length
            ? 'No evaluated start has an eligible route here. Try another road or departure.'
            : !changed
              ? 'The available start times have the same ranked weather exposure.'
              : 'Later is not always better. Best weather prioritizes Severe miles, High miles, then average risk.'}{' '}
          Using a time recalculates all roads for that departure.
        </p>
      )}
    </div>
  )
}
