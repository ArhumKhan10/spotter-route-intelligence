import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  Pane,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import { ArrowsOut, Crosshair, Minus, Plus, Stack, Check } from '@phosphor-icons/react'
import { COLORS, city, duration, number, time } from '../types'
import type { Plan, Checkpoint, CorridorPoint } from '../types'
import type { Theme } from '../useTheme'

type Props = {
  theme: Theme
  plan: Plan | null
  selectedId: string
  onSelect: (id: string) => void
  hour: number
  heatmap: boolean
  layer: string
  onLayer: (v: string) => void
  onCheckpoint: (p: Checkpoint) => void
  activeCheckpoint: Checkpoint | null
}

function HeatLayer({
  points,
  hour,
  enabled,
  layer,
}: {
  points: CorridorPoint[]
  hour: number
  enabled: boolean
  layer: string
}) {
  const map = useMap()
  useEffect(() => {
    if (!enabled || !points.length) return
    const canvas = L.DomUtil.create('canvas', 'weather-canvas') as HTMLCanvasElement
    map.getPane('weather')!.appendChild(canvas)
    let frame = 0
    const draw = () => {
      const size = map.getSize()
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]))
      const scale = 5
      canvas.width = Math.ceil(size.x / scale)
      canvas.height = Math.ceil(size.y / scale)
      canvas.style.width = `${size.x}px`
      canvas.style.height = `${size.y}px`
      const ctx = canvas.getContext('2d')!
      const grid = ctx.createImageData(canvas.width, canvas.height)
      const metersPerPixel =
        map.distance(map.containerPointToLatLng([0, 0]), map.containerPointToLatLng([100, 0])) / 100
      const radius = Math.max(22, Math.min(160, 60000 / metersPerPixel))
      const projected = points.map((p) => ({
        ...map.latLngToContainerPoint([p.lat, p.lon]),
        value: p.hours[hour],
      }))
      const rgb = [
        [63, 146, 110],
        [218, 177, 61],
        [235, 137, 62],
        [211, 78, 85],
        [140, 55, 90],
      ]
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          let sum = 0,
            weights = 0,
            nearest = Infinity
          for (const p of projected) {
            const d = Math.hypot(x * scale - p.x, y * scale - p.y)
            if (d > radius) continue
            nearest = Math.min(nearest, d)
            const w = 1 / Math.max(50, d * d)
            const value =
              layer === 'wind'
                ? Math.min(4, p.value.wind_mph / 14)
                : layer === 'rain'
                  ? Math.min(4, p.value.rain_in * 4)
                  : layer === 'snow'
                    ? Math.min(4, p.value.snow_in * 1.3)
                    : p.value.risk
            sum += value * w
            weights += w
          }
          if (!weights) continue
          const intensity = sum / weights
          const low = Math.floor(intensity),
            high = Math.min(4, low + 1),
            mix = intensity - low
          const index = (y * canvas.width + x) * 4
          for (let c = 0; c < 3; c++)
            grid.data[index + c] = rgb[low][c] * (1 - mix) + rgb[high][c] * mix
          grid.data[index + 3] = 95 * Math.max(0, 1 - (nearest / radius) ** 2)
        }
      }
      ctx.putImageData(grid, 0, 0)
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }
    schedule()
    map.on('moveend resize zoomend', schedule)
    return () => {
      cancelAnimationFrame(frame)
      map.off('moveend resize zoomend', schedule)
      canvas.remove()
    }
  }, [map, points, hour, enabled, layer])
  return null
}

function fitRoutes(map: L.Map, plan: Plan | null, animate = false) {
  if (!plan?.routes.length) return
  const coords = plan.routes.flatMap((route) =>
    route.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]),
  )
  map.fitBounds(L.latLngBounds(coords), {
    paddingTopLeft: [40, window.matchMedia('(max-width: 900px)').matches ? 130 : 90],
    paddingBottomRight: [65, window.matchMedia('(max-width: 900px)').matches ? 380 : 280],
    maxZoom: 9,
    animate: animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  })
}

function BasemapTiles() {
  const timers = useRef(new Map<HTMLImageElement, ReturnType<typeof setTimeout>>())
  const handlers = useMemo(() => {
    const clear = (event: L.TileEvent) => {
      const tile = event.tile as HTMLImageElement
      clearTimeout(timers.current.get(tile))
      timers.current.delete(tile)
    }
    return {
      tileloadstart: (event: L.TileEvent) => {
        const tile = event.tile as HTMLImageElement
        // Retry a stalled image once, preserving the provider's normal cache URL.
        // Leaflet only emits tileloadstart when it creates the tile.
        timers.current.set(
          tile,
          setTimeout(() => {
            timers.current.delete(tile)
            if (!tile.isConnected || (tile.complete && tile.naturalWidth > 0)) return
            const source = tile.src
            tile.removeAttribute('src')
            tile.src = source
          }, 12000),
        )
      },
      tileload: clear,
      tileunload: clear,
    }
  }, [])
  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.clear()
    }
  }, [])
  return (
    <TileLayer
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      maxZoom={19}
      keepBuffer={0}
      eventHandlers={handlers}
    />
  )
}

function MapControls({
  plan,
  layer,
  onLayer,
  activeCheckpoint,
}: Pick<Props, 'plan' | 'layer' | 'onLayer' | 'activeCheckpoint'>) {
  const map = useMap()
  const [layersOpen, setLayersOpen] = useState(false)
  const previous = useRef<Plan | null>(null)
  useEffect(() => {
    if (!plan?.routes.length || plan === previous.current) return
    const firstPlan = previous.current === null
    previous.current = plan
    if (!firstPlan) fitRoutes(map, plan, true)
  }, [plan, map])
  const fit = () => fitRoutes(map, plan, true)
  useEffect(() => {
    if (activeCheckpoint)
      map.flyTo([activeCheckpoint.lat, activeCheckpoint.lon], Math.max(8, map.getZoom()), {
        duration: 0.6,
        animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      })
  }, [activeCheckpoint, map])
  useEffect(() => {
    let firstSize = true
    const observer = new ResizeObserver(() => {
      if (firstSize) {
        firstSize = false
        return
      }
      const size = map.getContainer().getBoundingClientRect()
      if (!size.width || !size.height) return
      map.invalidateSize()
      fitRoutes(map, previous.current)
    })
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return (
    <>
      <div className="map-tool-stack" aria-label="Map controls">
        <button aria-label="Zoom in" onClick={() => map.zoomIn()}>
          <Plus size={19} />
        </button>
        <button aria-label="Zoom out" onClick={() => map.zoomOut()}>
          <Minus size={19} />
        </button>
        <span />
        <button aria-label="Fit all routes" onClick={fit}>
          <ArrowsOut size={18} />
        </button>
        <button
          aria-label="Center selected checkpoint or trip"
          onClick={() =>
            activeCheckpoint ? map.panTo([activeCheckpoint.lat, activeCheckpoint.lon]) : fit()
          }
        >
          <Crosshair size={19} />
        </button>
      </div>
      <div className="map-layer-control">
        {layersOpen && (
          <div className="layer-menu">
            <strong>Forecast layer</strong>
            {[
              ['risk', 'Overall risk'],
              ['wind', 'Wind gusts'],
              ['rain', 'Rain'],
              ['snow', 'Snow'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  onLayer(key)
                  setLayersOpen(false)
                }}
              >
                <span>{label}</span>
                {layer === key && <Check size={16} />}
              </button>
            ))}
          </div>
        )}
        <button
          className="map-layers"
          aria-label="Layers"
          aria-expanded={layersOpen}
          onClick={() => setLayersOpen(!layersOpen)}
        >
          <Stack size={19} />
          <span>Layers</span>
        </button>
      </div>
    </>
  )
}

export default function RouteMap(props: Props) {
  const { plan, selectedId, onSelect, hour, heatmap, layer, onCheckpoint, theme } = props
  const casing = theme === 'dark' ? '#17191a' : '#ffffff'
  const initialBounds = useMemo(
    () =>
      plan
        ? L.latLngBounds(
            plan.routes.flatMap((route) =>
              route.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]),
            ),
          )
        : undefined,
    [plan],
  )
  const sorted = useMemo(
    () =>
      [...(plan?.routes || [])].sort(
        (a, b) => Number(a.id === selectedId) - Number(b.id === selectedId),
      ),
    [plan, selectedId],
  )
  // Stable coordinate arrays keep Leaflet from redrawing every road on slider ticks.
  const positionsById = useMemo(
    () =>
      Object.fromEntries(
        (plan?.routes || []).map((route) => [
          route.id,
          route.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]),
        ]),
      ),
    [plan],
  )
  return (
    <div className="route-map" aria-label="Trip route and weather map">
      {plan && (
        <MapContainer
          bounds={initialBounds}
          boundsOptions={{
            paddingTopLeft: [40, window.matchMedia('(max-width: 900px)').matches ? 130 : 90],
            paddingBottomRight: [65, window.matchMedia('(max-width: 900px)').matches ? 380 : 280],
            maxZoom: 9,
          }}
          zoomSnap={0.25}
          zoomControl={false}
          scrollWheelZoom={true}
          attributionControl={true}
        >
          <BasemapTiles />
          <Pane name="weather" style={{ zIndex: 350, pointerEvents: 'none' }} />
          <HeatLayer
            points={plan?.corridor.points || []}
            hour={hour}
            enabled={heatmap}
            layer={layer}
          />
          {sorted.map((route) => {
            const chosen = route.id === selectedId
            const positions = positionsById[route.id]
            return (
              <Fragment key={route.id}>
                <Polyline
                  positions={positions}
                  pathOptions={{ color: casing, weight: chosen ? 9 : 7, opacity: 0.95 }}
                  smoothFactor={1.5}
                />
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color: chosen
                      ? theme === 'dark'
                        ? '#b2e8c6'
                        : '#2d6347'
                      : theme === 'dark'
                        ? '#7a8585'
                        : '#839095',
                    weight: chosen ? 5 : 3,
                    opacity: chosen ? 1 : 0.85,
                  }}
                  smoothFactor={1.5}
                  eventHandlers={{ click: () => onSelect(route.id) }}
                >
                  <Tooltip sticky>
                    <strong>
                      {route.name} · {duration(route.duration_seconds)}
                    </strong>
                    <br />
                    {number(route.distance_miles)} mi · ETA {time(route.arrival)}
                    <br />
                    {route.road_name} ·{' '}
                    {route.summary.eligible
                      ? plan!.risk_levels[route.summary.max_risk].label
                      : 'No Travel'}
                  </Tooltip>
                </Polyline>
              </Fragment>
            )
          })}
          {sorted.flatMap((route) =>
            route.checkpoints.map((p, i) => (
              <CircleMarker
                key={`${route.id}-${p.id}`}
                center={[p.lat, p.lon]}
                radius={route.id === selectedId ? (p.risk.level >= 2 ? 5.5 : 4) : 3}
                pathOptions={{
                  color: casing,
                  weight: route.id === selectedId ? 2 : 1.5,
                  fillColor: COLORS[p.risk.level],
                  fillOpacity: route.id === selectedId ? 1 : 0.75,
                }}
                eventHandlers={{
                  click: () => {
                    onSelect(route.id)
                    onCheckpoint(p)
                  },
                }}
              >
                <Tooltip direction="top">
                  <strong>
                    {route.name} ·{' '}
                    {i === 0
                      ? city(plan!.trip.origin.name)
                      : i === route.checkpoints.length - 1
                        ? city(plan!.trip.destination.name)
                        : `Mile ${number(p.mile)}`}
                  </strong>
                  <br />
                  {time(p.eta)} · {p.risk.label}
                  <br />
                  Wind {number(p.weather.wind_mph)} mph · Rain {p.weather.rain_in.toFixed(2)} in/hr
                </Tooltip>
              </CircleMarker>
            )),
          )}
          {plan && (
            <>
              <CircleMarker
                center={[plan.trip.origin.lat, plan.trip.origin.lon]}
                radius={7}
                pathOptions={{
                  color: casing,
                  weight: 3,
                  fillColor: theme === 'dark' ? '#b2e8c6' : '#254f40',
                  fillOpacity: 1,
                }}
              >
                <Tooltip permanent direction="top" className="city-map-label">
                  {city(plan.trip.origin.name)}
                </Tooltip>
              </CircleMarker>
              <CircleMarker
                center={[plan.trip.destination.lat, plan.trip.destination.lon]}
                radius={7}
                pathOptions={{ color: casing, weight: 3, fillColor: '#f17a45', fillOpacity: 1 }}
              >
                <Tooltip permanent direction="bottom" className="city-map-label">
                  {city(plan.trip.destination.name)}
                </Tooltip>
              </CircleMarker>
            </>
          )}
          <MapControls {...props} />
        </MapContainer>
      )}
    </div>
  )
}
