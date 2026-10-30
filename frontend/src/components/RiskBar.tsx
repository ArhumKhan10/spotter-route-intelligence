import { COLORS, LABELS } from '../types'
import type { Route } from '../types'

export default function RiskBar({ route, large = false }: { route: Route; large?: boolean }) {
  return (
    <div
      className={`risk-bar ${large ? 'large' : ''}`}
      role="img"
      aria-label={route.summary.risk_miles
        .map((m, i) => `${LABELS[i]}: ${m.toFixed(1)} miles`)
        .join(', ')}
    >
      {route.summary.risk_miles.map(
        (m, i) =>
          m > 0 && (
            <span
              key={i}
              style={{ width: `${(m / route.distance_miles) * 100}%`, background: COLORS[i] }}
              title={`${LABELS[i]}: ${m.toFixed(1)} mi`}
            />
          ),
      )}
    </div>
  )
}
