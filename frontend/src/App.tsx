import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  ArrowsDownUp,
  ArrowUpRight,
  BookmarkSimple,
  CalendarBlank,
  Check,
  CheckCircle,
  CircleNotch,
  Clock,
  CloudRain,
  CloudSun,
  DownloadSimple,
  Info,
  MapTrifold,
  NavigationArrow,
  Pause,
  Play,
  Question,
  RoadHorizon,
  ShieldCheck,
  Snowflake,
  Truck,
  Warning,
  Wind,
  X,
} from '@phosphor-icons/react'
import CityInput from './components/CityInput'
import RouteMap from './components/RouteMap'
import RiskBar from './components/RiskBar'
import Modal from './components/Modal'
import ThemeSwitch from './components/ThemeSwitch'
import JourneyWeather from './components/JourneyWeather'
import RouteComparison from './components/RouteComparison'
import DepartureComparison from './components/DepartureComparison'
import { routeTradeoff } from './routeInsights'
import { useTheme } from './useTheme'
import { api, city, COLORS, duration, LABELS, localInput, number, time } from './types'
import type { Checkpoint, DepartureOption, Location, Plan, Route } from './types'

const CHICAGO = { name: 'Chicago, IL', lat: 41.8781, lon: -87.6298 }
const NASHVILLE = { name: 'Nashville, TN', lat: 36.1627, lon: -86.7816 }
type SavedTrip = {
  origin: Location
  destination: Location
  load: string
  interval: number
  savedAt: string
}
type ModalName = 'method' | 'compare' | 'details' | 'saved' | 'why' | 'departures' | null
function readSaved(): SavedTrip[] {
  try {
    return JSON.parse(localStorage.getItem('spotter-trips') || '[]')
  } catch {
    return []
  }
}

export default function App() {
  const [theme, setTheme] = useTheme()
  const [mobileEditing, setMobileEditing] = useState(false)
  const [insightTab, setInsightTab] = useState<'route' | 'area'>('route')
  const plannerRef = useRef<HTMLElement>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const [origin, setOrigin] = useState<Location | null>(CHICAGO)
  const [destination, setDestination] = useState<Location | null>(NASHVILLE)
  const [departure, setDeparture] = useState(localInput())
  const [load, setLoad] = useState('35000')
  const [interval, setIntervalMiles] = useState(25)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [selectedId, setSelectedId] = useState('route-1')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hour, setHour] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [heatmap, setHeatmap] = useState(true)
  const [layer, setLayer] = useState('risk')
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null)
  const [modal, setModal] = useState<ModalName>(null)
  const [saved, setSaved] = useState<SavedTrip[]>(readSaved)
  const [toast, setToast] = useState('')
  const request = useRef<AbortController | null>(null)
  const selected = plan?.routes.find((r) => r.id === selectedId)
  const recommended = plan?.routes.find((r) => r.id === plan.recommended_id)
  const tradeoff = recommended && plan ? routeTradeoff(recommended, plan.routes) : null
  const fastestMinutes = plan
    ? Math.min(...plan.routes.map((r) => Math.round(r.duration_seconds / 60)))
    : 0
  const recommendationExtraMinutes = recommended
    ? Math.round(recommended.duration_seconds / 60) - fastestMinutes
    : 0
  const legendTitle =
    layer === 'wind'
      ? 'Wind gusts · mph'
      : layer === 'rain'
        ? 'Rain · in/hr'
        : layer === 'snow'
          ? 'Snow · in/hr'
          : 'Weather risk'
  const legendLabels =
    layer === 'wind'
      ? ['0', '14', '28', '42', '56+']
      : layer === 'rain'
        ? ['0', '0.25', '0.50', '0.75', '1.00+']
        : layer === 'snow'
          ? ['0', '0.77', '1.54', '2.31', '3.08+']
          : LABELS
  const dirty =
    !!plan &&
    (origin?.lat !== plan.trip.origin.lat ||
      origin?.lon !== plan.trip.origin.lon ||
      destination?.lat !== plan.trip.destination.lat ||
      destination?.lon !== plan.trip.destination.lon ||
      Number(load) !== plan.trip.load_lb ||
      interval !== plan.trip.interval_miles ||
      new Date(departure).getTime() !== new Date(plan.trip.departure).getTime())

  const accept = (result: Plan) => {
    setPlan(result)
    setSelectedId(result.recommended_id || result.routes[0]?.id || '')
    setCheckpoint(null)
    setHour(0)
    setPlaying(false)
    setMobileEditing(false)
  }
  const editTrip = () => {
    setMobileEditing(true)
    requestAnimationFrame(() => plannerRef.current?.focus())
  }
  const showMap = () => {
    setMobileEditing(false)
    requestAnimationFrame(() => editButtonRef.current?.focus())
  }
  const editorKeys = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!mobileEditing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      showMap()
      return
    }
    if (event.key !== 'Tab') return
    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
      ),
    ).filter((el) => el.getClientRects().length)
    const first = controls[0],
      last = controls[controls.length - 1]
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === event.currentTarget)
    ) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }
  useEffect(() => {
    const controller = new AbortController()
    request.current = controller
    api<Plan>('/api/demo/', { signal: controller.signal })
      .then((result) => {
        accept(result)
        setDeparture(localInput(new Date(result.trip.departure)))
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setHour((h) => (h >= 48 ? 0 : h + 1)), 850)
    return () => clearInterval(timer)
  }, [playing])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)')
    const sync = () => {
      if (!media.matches) setMobileEditing(false)
    }
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const loadExample = async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    try {
      const result = await api<Plan>(`/api/demo/?interval=${interval}&load=${Number(load) || 0}`, {
        signal: controller.signal,
      })
      accept(result)
      setOrigin(CHICAGO)
      setDestination(NASHVILLE)
      setDeparture(localInput(new Date(result.trip.departure)))
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Unable to load the example.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }
  const findRoutes = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!origin || !destination) {
      setError('Select an origin and destination from the city search results.')
      return
    }
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    setCheckpoint(null)
    try {
      const result = await api<Plan>('/api/plan/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]),
        body: JSON.stringify({
          origin,
          destination,
          departure: new Date(departure).toISOString(),
          load_lb: Number(load),
          interval_miles: interval,
        }),
      })
      accept(result)
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error && e.name !== 'TimeoutError'
            ? e.message
            : 'The providers took too long. Please try again.',
        )
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }
  const select = (id: string) => {
    setSelectedId(id)
    setCheckpoint(null)
  }
  const applyDeparture = async (option: DepartureOption) => {
    if (!plan || !option.available || loading) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    try {
      const result =
        plan.mode === 'demo'
          ? await api<Plan>(
              `/api/demo/?interval=${plan.trip.interval_miles}&load=${plan.trip.load_lb}&departure=${encodeURIComponent(option.departure)}`,
              { signal: controller.signal },
            )
          : await api<Plan>('/api/plan/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]),
              body: JSON.stringify({ ...plan.trip, departure: option.departure }),
            })
      accept(result)
      setOrigin(result.trip.origin)
      setDestination(result.trip.destination)
      setLoad(String(result.trip.load_lb))
      setIntervalMiles(result.trip.interval_miles)
      setDeparture(localInput(new Date(result.trip.departure)))
      setModal(null)
      setToast('Departure updated. All routes recalculated.')
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Unable to update departure.')
        setModal(null)
        editTrip()
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }
  const saveTrip = () => {
    if (!plan) return
    const item = {
      origin: plan.trip.origin,
      destination: plan.trip.destination,
      load: String(plan.trip.load_lb),
      interval: plan.trip.interval_miles,
      savedAt: new Date().toISOString(),
    }
    const items = [
      item,
      ...saved.filter(
        (t) => t.origin.name !== item.origin.name || t.destination.name !== item.destination.name,
      ),
    ].slice(0, 5)
    try {
      localStorage.setItem('spotter-trips', JSON.stringify(items))
      setSaved(items)
      setToast('Trip saved on this device')
    } catch {
      setToast('Your browser could not save this trip')
    }
  }
  const download = () => {
    if (!plan) return
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'spotter-trip.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app-shell">
      <header className="topbar" inert={mobileEditing}>
        <a className="brand" href="/" aria-label="Spotter home">
          <RoadHorizon size={27} weight="bold" />
          <span>
            spotter<span className="brand-period">.</span>
          </span>
        </a>
        <span className="header-divider" />
        <span className="workspace-title">Route planner</span>
        <div className="topbar-actions">
          <button
            className="header-demo"
            aria-label="Explore example trip"
            onClick={loadExample}
            disabled={loading}
          >
            <RoadHorizon size={16} />
            <span>Demo trip</span>
          </button>
          <button
            className="icon-button"
            aria-label="Saved trips"
            title="Saved trips"
            onClick={() => setModal('saved')}
          >
            <BookmarkSimple size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="How it works"
            title="How it works"
            onClick={() => setModal('method')}
          >
            <Question size={20} />
          </button>
          <span className="header-divider" />
          <ThemeSwitch theme={theme} onChange={setTheme} />
        </div>
      </header>

      <main className={`main-workspace ${mobileEditing ? 'editing-trip' : ''}`}>
        {mobileEditing && (
          <div className="mobile-editor-scrim" aria-hidden="true" onClick={showMap} />
        )}
        <aside
          className="planner-column"
          aria-label="Trip planner"
          role={mobileEditing ? 'dialog' : undefined}
          aria-modal={mobileEditing || undefined}
          ref={plannerRef}
          tabIndex={-1}
          onKeyDown={editorKeys}
        >
          <span className="sheet-handle" aria-hidden="true" />
          <div className="planner-heading">
            {mobileEditing ? <h1>Plan a trip</h1> : <h2>Plan a trip</h2>}
            <button className="mobile-close icon-button" aria-label="Back to map" onClick={showMap}>
              <X size={20} />
            </button>
            <button
              className={`data-tag ${plan?.mode === 'live' ? 'live' : ''}`}
              onClick={() => setModal('method')}
              title={
                plan?.mode === 'live'
                  ? 'Current provider forecast'
                  : 'Real roads, simulated weather'
              }
              aria-label={plan?.mode === 'live' ? 'About live forecast' : 'About demo data'}
            >
              <span />
              {plan?.mode === 'live' ? 'Live' : 'Demo'}
            </button>
          </div>
          <form className="trip-planner" aria-label="Plan your trip" onSubmit={findRoutes}>
            <div className="locations">
              <CityInput label="Origin" value={origin} onChange={setOrigin} kind="origin" />
              <button
                className="swap-button"
                type="button"
                aria-label="Swap origin and destination"
                onClick={() => {
                  setOrigin(destination)
                  setDestination(origin)
                }}
              >
                <ArrowsDownUp size={15} />
              </button>
              <CityInput
                label="Destination"
                value={destination}
                onChange={setDestination}
                kind="destination"
              />
            </div>
            <div className="departure-field">
              <label htmlFor="departure">
                Departure{' '}
                <span>
                  {Intl.DateTimeFormat()
                    .resolvedOptions()
                    .timeZone.split('/')
                    .pop()
                    ?.replaceAll('_', ' ')}
                </span>
              </label>
              <div className="input-wrap">
                <CalendarBlank size={16} />
                <input
                  id="departure"
                  type="datetime-local"
                  value={departure}
                  onChange={(e) => setDeparture(e.target.value)}
                  required
                  min={localInput(new Date(Date.now() - 300000))}
                  max={localInput(new Date(Date.now() + 48 * 3600000))}
                />
              </div>
            </div>
            <div className="load-interval">
              <div className="load-field">
                <label htmlFor="load">Load weight</label>
                <div className="input-wrap">
                  <Truck size={17} />
                  <input
                    id="load"
                    type="number"
                    min="0"
                    max="80000"
                    step="1"
                    value={load}
                    onChange={(e) => setLoad(e.target.value)}
                    required
                  />
                  <span>lb</span>
                </div>
              </div>
              <fieldset className="interval-field">
                <legend>
                  Check every <span>mi</span>
                </legend>
                <div className="segmented">
                  {[10, 25, 50].map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={interval === value ? 'selected' : ''}
                      aria-pressed={interval === value}
                      onClick={() => setIntervalMiles(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <button className="primary plan-button" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <CircleNotch size={17} className="spin" />
                  Checking forecasts
                </>
              ) : (
                <>
                  <NavigationArrow size={16} weight="fill" />
                  Find safest route
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          {error && (
            <div className="error-message" role="alert">
              <Warning size={17} />
              <div>
                {error}
                <button onClick={loadExample}>
                  Load demo <ArrowRight size={13} />
                </button>
              </div>
              <button
                className="error-close"
                aria-label="Dismiss error"
                onClick={() => setError('')}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {dirty && !loading && (
            <div className="dirty-note">
              Unsaved trip changes{' '}
              <button
                onClick={() => document.getElementById('load')?.focus()}
                title="Update the trip, then find routes"
              >
                <Info size={14} />
              </button>
            </div>
          )}
          <section className="route-options" aria-labelledby="routes-title">
            <div className="options-heading">
              <h2 id="routes-title">
                Routes <span>{plan?.routes.length || '-'}</span>
              </h2>
              <button onClick={() => setModal('compare')} disabled={!plan}>
                Compare <ArrowUpRight size={13} />
              </button>
            </div>
            {plan?.warnings.map((warning) => (
              <div className="route-warning" key={warning}>
                <Warning size={15} />
                <span>{warning}</span>
              </div>
            ))}
            <div className={`route-list ${loading ? 'updating' : ''}`}>
              {plan ? (
                plan.routes.map((route) => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    selected={selectedId === route.id}
                    recommended={plan.recommended_id === route.id}
                    tradeoff={plan.recommended_id === route.id ? tradeoff : null}
                    onSelect={() => select(route.id)}
                  />
                ))
              ) : (
                <div className="empty-state">
                  <RoadHorizon size={30} />
                  <p>{loading ? 'Loading routes' : 'Plan your first trip'}</p>
                </div>
              )}
            </div>
            {recommended && (
              <button className="why-route" onClick={() => setModal('why')}>
                <ShieldCheck size={16} />
                <span>Why {recommended.name}?</span>
                <ArrowUpRight size={14} />
              </button>
            )}
          </section>
          <div className="planner-bottom">
            <span className="data-source">
              <span className={`source-dot ${plan?.mode === 'demo' ? 'demo' : ''}`} />
              {plan?.mode === 'demo' ? 'Simulated weather' : 'Live forecast'}
            </span>
            {plan?.mode === 'demo' && (
              <button onClick={loadExample} disabled={loading}>
                Refresh demo <ArrowRight size={12} />
              </button>
            )}
          </div>
        </aside>

        <section className="map-panel" aria-label="Route overview" inert={mobileEditing}>
          <RouteMap
            plan={plan}
            selectedId={selectedId}
            onSelect={select}
            hour={hour}
            heatmap={heatmap}
            layer={layer}
            onLayer={setLayer}
            onCheckpoint={setCheckpoint}
            activeCheckpoint={checkpoint}
            theme={theme}
          />
          <div className="map-context">
            <h1>
              {plan ? (
                <>
                  {city(plan.trip.origin.name)}
                  <ArrowRight size={15} />
                  {city(plan.trip.destination.name)}
                </>
              ) : (
                'Your route'
              )}
            </h1>
            <span className="map-mode">{plan?.mode === 'live' ? 'Live' : 'Demo'}</span>
            <button
              className="save-map-trip"
              aria-label="Save current trip"
              title="Save current trip"
              onClick={saveTrip}
              disabled={!plan}
            >
              <BookmarkSimple size={16} />
            </button>
          </div>
          <button
            className="mobile-edit"
            ref={editButtonRef}
            onClick={editTrip}
            aria-label="Edit trip"
          >
            <Truck size={17} />
            <span>Edit trip</span>
          </button>
          <div className="weather-toggle">
            <CloudSun size={18} />
            <span>Weather</span>
            <button
              role="switch"
              aria-checked={heatmap}
              aria-label="Weather overlay"
              className={`switch ${heatmap ? 'on' : ''}`}
              onClick={() => setHeatmap(!heatmap)}
            >
              <span />
            </button>
          </div>
          {loading && (
            <div className="loading-map" role="status">
              <CircleNotch size={18} className="spin" />
              <span>Checking the route</span>
              <button
                onClick={() => {
                  request.current?.abort()
                  setLoading(false)
                }}
              >
                Cancel
              </button>
            </div>
          )}
          {checkpoint ? (
            <CheckpointDetail point={checkpoint} onClose={() => setCheckpoint(null)} />
          ) : (
            selected && (
              <div className="journey-card">
                <Clock size={16} />
                <span className="arrival">
                  <span>ETA</span> {time(selected.arrival)}
                </span>
                <span className="checkpoint-count">{selected.checkpoints.length} checkpoints</span>
                <button onClick={() => setModal('details')} aria-label="View trip">
                  View trip <ArrowUpRight size={14} />
                </button>
              </div>
            )
          )}
          <div className="map-dock">
            <div className="mobile-routes">
              <div className="mobile-routes-heading">
                <span>Routes</span>
                {recommended && (
                  <button
                    className="mobile-why"
                    aria-label={`Why ${recommended.name}?`}
                    title={`Why ${recommended.name}?`}
                    onClick={() => setModal('why')}
                  >
                    <Info size={14} />
                  </button>
                )}
                <button onClick={() => setModal('compare')}>
                  Compare <ArrowUpRight size={12} />
                </button>
              </div>
              <div className="mobile-route-list">
                {plan?.routes.map((route) => (
                  <button
                    key={route.id}
                    className={route.id === selectedId ? 'selected' : ''}
                    aria-pressed={route.id === selectedId}
                    aria-label={`${route.name}, ${plan.recommended_id === route.id ? 'recommended, ' : ''}${duration(route.duration_seconds)}, ${number(route.distance_miles)} miles`}
                    onClick={() => select(route.id)}
                  >
                    <span className="mobile-route-name">
                      {route.name}
                      {route.id === plan.recommended_id && <Check size={12} />}
                    </span>
                    <strong>{duration(route.duration_seconds)}</strong>
                    <span className={`route-chip-risk-label risk-${route.summary.max_risk}`}>
                      {LABELS[route.summary.max_risk]}
                    </span>
                  </button>
                ))}
              </div>
              {selectedId === recommended?.id && tradeoff && (
                <p className="mobile-tradeoff" title={tradeoff.baseline}>
                  {tradeoff.text}
                </p>
              )}
            </div>
            <div className="map-insights">
              <div
                className="insight-tabs"
                role="tablist"
                aria-label="Weather view"
                onKeyDown={(event) => {
                  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                    event.preventDefault()
                    const next =
                      event.key === 'Home'
                        ? 'route'
                        : event.key === 'End'
                          ? 'area'
                          : insightTab === 'route'
                            ? 'area'
                            : 'route'
                    setInsightTab(next)
                    document.getElementById(`weather-tab-${next}`)?.focus()
                    if (next === 'route') setPlaying(false)
                  }
                }}
              >
                <button
                  role="tab"
                  id="weather-tab-route"
                  aria-controls="weather-panel-route"
                  aria-selected={insightTab === 'route'}
                  tabIndex={insightTab === 'route' ? 0 : -1}
                  onClick={() => {
                    setInsightTab('route')
                    setPlaying(false)
                  }}
                >
                  Along route
                </button>
                <button
                  role="tab"
                  id="weather-tab-area"
                  aria-controls="weather-panel-area"
                  aria-selected={insightTab === 'area'}
                  tabIndex={insightTab === 'area' ? 0 : -1}
                  onClick={() => setInsightTab('area')}
                >
                  Area forecast
                </button>
                <span className="insight-route-name">{selected?.name}</span>
              </div>
              <div
                id="weather-panel-route"
                role="tabpanel"
                aria-labelledby="weather-tab-route"
                hidden={insightTab !== 'route'}
              >
                {selected && (
                  <JourneyWeather
                    key={selected.id}
                    route={selected}
                    active={checkpoint}
                    onCheckpoint={setCheckpoint}
                    onDepartures={() => setModal('departures')}
                  />
                )}
              </div>
              <div
                id="weather-panel-area"
                role="tabpanel"
                aria-labelledby="weather-tab-area"
                hidden={insightTab !== 'area'}
              >
                <div className="forecast-panel">
                  <div className="forecast-heading">
                    <div>
                      <CloudSun size={16} />
                      <strong>Forecast</strong>
                      <span className="forecast-time">
                        {plan && time(plan.corridor.times[hour])}
                      </span>
                    </div>
                    <div className="forecast-heading-right">
                      <span className="hour-offset">+{hour}h</span>
                      <button
                        className="forecast-info"
                        aria-label="About forecast slider"
                        title="Area weather preview. Route rankings use each checkpoint's arrival time."
                        onClick={() => setModal('method')}
                      >
                        <Info size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="forecast-control">
                    <button
                      className="play-button"
                      aria-label={playing ? 'Pause forecast' : 'Play forecast'}
                      onClick={() => setPlaying(!playing)}
                      disabled={!plan}
                    >
                      {playing ? (
                        <Pause size={15} weight="fill" />
                      ) : (
                        <Play size={15} weight="fill" />
                      )}
                    </button>
                    <div className="slider-wrap">
                      <input
                        type="range"
                        min="0"
                        max="48"
                        step="1"
                        value={hour}
                        aria-label="Forecast hours ahead"
                        aria-valuetext={`${hour} hours ahead`}
                        onChange={(e) => {
                          setHour(Number(e.target.value))
                          setPlaying(false)
                        }}
                        disabled={!plan}
                      />
                      <div className="slider-labels">
                        {[0, 12, 24, 36, 48].map((value) => (
                          <button
                            key={value}
                            onClick={() => {
                              setHour(value)
                              setPlaying(false)
                            }}
                            className={value === hour ? 'active' : ''}
                          >
                            {value === 0 ? 'Now' : `+${value}h`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="risk-legend" aria-label={legendTitle}>
              {legendLabels.map((label, i) => (
                <span key={label}>
                  <i style={{ background: COLORS[i] }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>
      </main>

      {toast && (
        <div className="toast" role="status">
          <CheckCircle size={19} weight="fill" />
          {toast}
        </div>
      )}

      {modal && (
        <Modal
          title={
            modal === 'why'
              ? `Why ${recommended?.name || 'this route'}?`
              : modal === 'departures'
                ? 'Choose when to leave'
                : modal === 'method'
                  ? 'How Spotter chooses a route'
                  : modal === 'compare'
                    ? 'Compare route weather'
                    : modal === 'saved'
                      ? 'Your saved trips.'
                      : `${selected?.name || 'Trip'} · Weather checkpoints`
          }
          onClose={() => setModal(null)}
          wide={modal === 'compare' || modal === 'details' || modal === 'departures'}
        >
          {modal === 'method' && <Method />}
          {modal === 'departures' && selected && (
            <DepartureComparison
              route={selected}
              demo={plan?.mode === 'demo'}
              loading={loading}
              onApply={applyDeparture}
            />
          )}
          {modal === 'why' && recommended && (
            <section className="recommendation-evidence" aria-label="Recommendation explanation">
              <h3>{recommended.name} is recommended</h3>
              <p>Weather risk takes priority over driving time.</p>
              <dl>
                <div>
                  <dt>Severe weather</dt>
                  <dd>
                    {recommended.summary.risk_miles[3].toFixed(1)} <span>mi</span>
                  </dd>
                </div>
                <div>
                  <dt>High-risk weather</dt>
                  <dd>
                    {recommended.summary.risk_miles[2].toFixed(1)} <span>mi</span>
                  </dd>
                </div>
              </dl>
              <p>
                {recommendationExtraMinutes > 0
                  ? `${recommendationExtraMinutes} minutes longer than the fastest route. Less dangerous weather comes first.`
                  : 'Also the fastest route among the options with the best weather risk.'}
              </p>
              <button className="text-button" onClick={() => setModal('method')}>
                View the risk rules <ArrowUpRight size={14} />
              </button>
            </section>
          )}
          {modal === 'compare' && plan && (
            <RouteComparison
              plan={plan}
              onSelect={(id) => {
                select(id)
                setModal(null)
              }}
            />
          )}
          {modal === 'details' && selected && (
            <>
              <div className="detail-overview">
                <span>
                  <RoadHorizon size={17} />
                  {number(selected.distance_miles)} mi
                </span>
                <span>
                  <Clock size={17} />
                  {duration(selected.duration_seconds)}
                </span>
                <span>
                  <Truck size={17} />
                  {number(plan!.trip.load_lb)} lb
                </span>
                <button onClick={download}>
                  <DownloadSimple size={15} />
                  Export JSON
                </button>
              </div>
              <p className="small-note">
                All times are in your device’s local time zone. Forecasts are sampled at the hour
                ending at or immediately after each arrival.{' '}
                {selected.via && 'This option uses an intermediate waypoint.'}
              </p>
              <div className="checkpoint-table">
                <table>
                  <thead>
                    <tr>
                      <th>Checkpoint</th>
                      <th>ETA</th>
                      <th>Wind gusts</th>
                      <th>Rain</th>
                      <th>Snow</th>
                      <th>Risk</th>
                      <th>
                        <span className="sr-only">Show on map</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.checkpoints.map((p, i) => (
                      <tr key={p.id}>
                        <td>
                          <strong>
                            {i === 0
                              ? 'Origin'
                              : i === selected.checkpoints.length - 1
                                ? 'Destination'
                                : `Checkpoint ${i}`}
                          </strong>
                          <span>Mile {p.mile.toFixed(1)}</span>
                        </td>
                        <td>
                          {time(p.eta)}
                          <span>
                            {new Date(p.eta).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </td>
                        <td>{number(p.weather.wind_mph)} mph</td>
                        <td>{p.weather.rain_in.toFixed(2)} in/hr</td>
                        <td>{p.weather.snow_in.toFixed(2)} in/hr</td>
                        <td>
                          <RiskBadge level={p.risk.level} />
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            aria-label={`Show checkpoint ${i} on map`}
                            onClick={() => {
                              setCheckpoint(p)
                              setModal(null)
                            }}
                          >
                            <ArrowUpRight size={17} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {modal === 'saved' && (
            <>
              <p className="modal-intro">
                Saved on this device. Open a trip to fill the planner, then request a fresh
                forecast.
              </p>
              {saved.length ? (
                saved.map((trip, i) => (
                  <div className="saved-trip" key={trip.savedAt}>
                    <div>
                      <strong>
                        {city(trip.origin.name)} <ArrowRight size={14} />{' '}
                        {city(trip.destination.name)}
                      </strong>
                      <p>
                        {number(Number(trip.load))} lb · Every {trip.interval} mi
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => {
                        setOrigin(trip.origin)
                        setDestination(trip.destination)
                        setLoad(trip.load)
                        setIntervalMiles(trip.interval)
                        setDeparture(localInput())
                        setModal(null)
                        setToast('Trip loaded. Find routes for a fresh forecast.')
                      }}
                    >
                      Open <ArrowRight size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Delete saved trip ${i + 1}`}
                      onClick={() => {
                        const items = saved.filter((_, index) => i !== index)
                        try {
                          localStorage.setItem('spotter-trips', JSON.stringify(items))
                          setSaved(items)
                        } catch {
                          setToast('Unable to update saved trips')
                        }
                      }}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <BookmarkSimple size={35} />
                  <p>Keep your regular roads close.</p>
                  <span>Use the bookmark above the map to save a trip.</span>
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  )
}

function RiskBadge({ level }: { level: number }) {
  return (
    <span className={`risk-badge risk-${level}`}>
      <i style={{ background: COLORS[level] }} />
      {LABELS[level]}
    </span>
  )
}
function RouteCard({
  route,
  selected,
  recommended,
  onSelect,
  tradeoff,
}: {
  route: Route
  selected: boolean
  recommended: boolean
  onSelect: () => void
  tradeoff?: ReturnType<typeof routeTradeoff>
}) {
  return (
    <button
      className={'route-card ' + (selected ? 'selected' : '')}
      onClick={onSelect}
      aria-pressed={selected}
      title={route.road_name}
      aria-label={
        route.name +
        ', ' +
        (recommended ? 'recommended, ' : '') +
        duration(route.duration_seconds) +
        ', ' +
        number(route.distance_miles) +
        ' miles'
      }
    >
      <div className="route-card-heading">
        <span className="route-name">{route.name}</span>
        {recommended ? (
          <span className="recommended-badge">
            <Check size={12} weight="bold" />
            Recommended
          </span>
        ) : (
          <RiskBadge level={route.summary.max_risk} />
        )}
      </div>
      <div className="route-card-stats">
        <strong>{duration(route.duration_seconds)}</strong>
        <span>{number(route.distance_miles)} mi</span>
        <ArrowUpRight size={15} />
      </div>
      <RiskBar route={route} />
      {tradeoff && (
        <span className="route-tradeoff" title={tradeoff.baseline}>
          {tradeoff.text}
        </span>
      )}
    </button>
  )
}
function CheckpointDetail({ point, onClose }: { point: Checkpoint; onClose: () => void }) {
  return (
    <div className="checkpoint-popup">
      <div className="checkpoint-popup-title">
        <div>
          <span>Weather checkpoint</span>
          <h3>Mile {point.mile.toFixed(1)}</h3>
        </div>
        <button className="icon-button" aria-label="Close checkpoint" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <RiskBadge level={point.risk.level} />
      <p>
        Expected arrival <strong>{time(point.eta)}</strong>
      </p>
      <div className="checkpoint-weather">
        <div>
          <Wind size={20} />
          <strong>
            {number(point.weather.wind_mph)}
            <small> mph</small>
          </strong>
          <span>Wind gusts</span>
        </div>
        <div>
          <CloudRain size={20} />
          <strong>
            {point.weather.rain_in.toFixed(2)}
            <small> in/hr</small>
          </strong>
          <span>Rain</span>
        </div>
        <div>
          <Snowflake size={20} />
          <strong>
            {point.weather.snow_in.toFixed(2)}
            <small> in/hr</small>
          </strong>
          <span>Snow</span>
        </div>
      </div>
      <div className="checkpoint-cause">
        <Info size={14} />
        {point.risk.causes.join(' & ')}
      </div>
    </div>
  )
}
function Method() {
  return (
    <div className="method">
      <p className="modal-intro">
        Enter your start, destination, departure time, and load. Spotter finds road options, checks
        the weather when you will reach each checkpoint, and recommends the route with less
        dangerous weather.
      </p>
      <div className="method-steps">
        <div>
          <MapTrifold size={23} />
          <section>
            <h3>Find road options</h3>
            <p>
              OSRM finds real driving routes. If alternatives are limited, we ask for routes through
              intermediate waypoints. Only distinct routes are shown; some trips may have fewer than
              three.
            </p>
          </section>
        </div>
        <div>
          <Clock size={23} />
          <section>
            <h3>Check weather at your arrival time</h3>
            <p>
              We sample every 10, 25, or 50 miles, including both endpoints. Arrival times use
              road-segment durations. Open-Meteo provides hourly rain, snow, and 10 m wind gusts,
              with gusts used as a conservative wind measure.
            </p>
          </section>
        </div>
        <div>
          <ShieldCheck size={23} />
          <section>
            <h3>Recommend less dangerous weather</h3>
            <p>
              No Travel routes are excluded. Remaining routes are ordered by fewest Severe miles,
              fewest High miles, lowest distance-weighted average risk, and finally shortest travel
              time. If all routes are blocked, none is recommended.
            </p>
          </section>
        </div>
      </div>
      <h3>The weather risk rules</h3>
      <div className="rules-table">
        <table>
          <thead>
            <tr>
              <th>Condition</th>
              {LABELS.map((l, i) => (
                <th key={l} style={{ color: COLORS[i] }}>
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Wind · mph</th>
              <td>&lt;25</td>
              <td>25–&lt;35</td>
              <td>35–&lt;45</td>
              <td>45–&lt;55</td>
              <td>≥55</td>
            </tr>
            <tr>
              <th>Rain · in/hr</th>
              <td>&lt;0.10</td>
              <td>0.10–&lt;0.25</td>
              <td>0.25–&lt;0.50</td>
              <td>0.50–1.00</td>
              <td>&gt;1.00</td>
            </tr>
            <tr>
              <th>Snow · in/hr</th>
              <td>&lt;0.5</td>
              <td>0.5–&lt;1.0</td>
              <td>1.0–&lt;2.0</td>
              <td>2.0–3.0</td>
              <td>&gt;3.0</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>Your load matters.</strong> Wind ≥55 mph means No Travel for all loads. Wind ≥45 mph
        with a load over 30,000 lb means No Travel. Wind ≥35 mph with a load over 40,000 lb means at
        least Severe.
      </p>
      <h3>Reading the map</h3>
      <p>
        Route checkpoints and risk miles always use arrival-time weather. The 0–48 hour slider
        changes the corridor heatmap at one fixed forecast time. Its colors interpolate nearby
        sampled forecasts. Wind, rain, and snow layers show their respective intensity; Overall risk
        includes your load.
      </p>
      <div className="method-notice">
        <Info size={19} />
        <p>
          OSRM’s public driving profile does not check truck height, axle weight, hazmat
          restrictions, traffic, or driver hours. ETAs exclude breaks. Confirm truck access before
          dispatch.
        </p>
      </div>
      <p className="small-note">
        Example mode uses real cached road geometries and a synthetic moving weather front. Live
        mode uses current provider forecasts and never falls back silently to simulated data.
      </p>
      <div className="source-links">
        <a href="https://project-osrm.org/docs/v5.24.0/api/" target="_blank" rel="noreferrer">
          OSRM documentation <ArrowUpRight size={13} />
        </a>
        <a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">
          Open-Meteo documentation <ArrowUpRight size={13} />
        </a>
      </div>
    </div>
  )
}
