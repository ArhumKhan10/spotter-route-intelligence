import { useEffect, useState } from 'react'
import { ArrowUpRight } from '@phosphor-icons/react'
import { COLORS, LABELS, number, time } from '../types'
import type { Checkpoint, Route } from '../types'

export default function JourneyWeather({
  route,
  active,
  onCheckpoint,
  onDepartures,
  departureDisabled = false,
}: {
  route: Route
  active: Checkpoint | null
  onCheckpoint: (point: Checkpoint) => void
  onDepartures: () => void
  departureDisabled?: boolean
}) {
  const [selected, setSelected] = useState(0)
  const [hovered, setHovered] = useState<number | null>(null)
  const points = route.checkpoints
  useEffect(() => {
    setSelected(0)
    setHovered(null)
  }, [points])
  useEffect(() => {
    if (active) {
      const index = points.findIndex((point) => point.id === active.id)
      if (index >= 0) setSelected(index)
    }
  }, [active, points])
  const point = points[hovered ?? selected] || points[0]
  if (!point) return null
  const cause = point.risk.causes[0] || ''
  const metric = cause.includes('Rain')
    ? `${point.weather.rain_in.toFixed(2)} in/hr rain`
    : cause.includes('Snow')
      ? `${point.weather.snow_in.toFixed(2)} in/hr snow`
      : `${number(point.weather.wind_mph)} mph wind`
  const choose = (index: number) => {
    setSelected(index)
    setHovered(null)
    onCheckpoint(points[index])
  }
  const nearest = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const mile =
      Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * route.distance_miles
    return points.reduce(
      (best, p, index) =>
        Math.abs(p.mile - mile) < Math.abs(points[best].mile - mile) ? index : best,
      0,
    )
  }
  return (
    <div className="journey-weather">
      <div className="journey-weather-heading">
        <span>
          <i style={{ background: COLORS[point.risk.level] }} />
          {point.risk.label} <span>· {metric}</span>
        </span>
        <button
          onClick={onDepartures}
          disabled={departureDisabled}
          title={departureDisabled ? 'Update routes to compare the current trip.' : undefined}
        >
          Departure times <ArrowUpRight size={13} />
        </button>
      </div>
      <div
        className="journey-profile"
        role="slider"
        tabIndex={0}
        aria-label="Arrival weather along selected route"
        aria-valuemin={0}
        aria-valuemax={Math.round(route.distance_miles)}
        aria-valuenow={Math.round(point.mile)}
        aria-valuetext={`${point.risk.label} at mile ${number(point.mile)}, arriving ${new Date(point.eta).toLocaleString()}, ${metric}`}
        onPointerMove={(event) => {
          if (event.pointerType === 'mouse') setHovered(nearest(event))
        }}
        onPointerLeave={() => setHovered(null)}
        onPointerDown={(event) => {
          event.currentTarget.focus()
          choose(nearest(event))
        }}
        onKeyDown={(event) => {
          const moves: Record<string, number> = {
            ArrowRight: selected + 1,
            ArrowUp: selected + 1,
            ArrowLeft: selected - 1,
            ArrowDown: selected - 1,
            Home: 0,
            End: points.length - 1,
            PageUp: selected + 5,
            PageDown: selected - 5,
          }
          if (event.key in moves) {
            event.preventDefault()
            choose(Math.max(0, Math.min(points.length - 1, moves[event.key])))
          }
        }}
      >
        <div className="journey-profile-track" aria-hidden="true">
          {points.slice(1).map((right, index) => {
            const left = points[index]
            const risk = Math.max(left.risk.level, right.risk.level)
            return (
              <span
                key={right.id}
                style={{ flexGrow: Math.max(0, right.mile - left.mile), background: COLORS[risk] }}
                title={`${LABELS[risk]} · ${number(left.mile)}-${number(right.mile)} mi`}
              />
            )
          })}
        </div>
        <span
          className="journey-profile-marker"
          aria-hidden="true"
          style={{ left: `${(point.mile / route.distance_miles) * 100}%` }}
        />
      </div>
      <div className="journey-profile-axis">
        <span>0 mi</span>
        <output aria-live="off">
          {number(point.mile)} mi · ETA {time(point.eta)}
        </output>
        <span>{number(route.distance_miles)} mi</span>
      </div>
    </div>
  )
}
