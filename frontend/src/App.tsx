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
import { api, city, COLORS, duration, LABELS, localInput, number, time } from './types'
import type { Checkpoint, Location, Plan, Route } from './types'

const CHICAGO = { name: 'Chicago, IL', lat: 41.8781, lon: -87.6298 }
const NASHVILLE = { name: 'Nashville, TN', lat: 36.1627, lon: -86.7816 }
type SavedTrip = {
  origin: Location
  destination: Location
  load: string
  interval: number
  savedAt: string
}
type ModalName = 'method' | 'compare' | 'details' | 'saved' | null
function readSaved(): SavedTrip[] {
  try {
    return JSON.parse(localStorage.getItem('spotter-trips') || '[]')
  } catch {
    return []
  }
}

export default function App() {
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
      <header className="topbar">
        <a className="brand" href="/" aria-label="Spotter home">
          <span className="brand-symbol">
            <RoadHorizon size={25} weight="bold" />
          </span>
          <span>
            spotter<span className="brand-period">.</span>
          </span>
        </a>
        <div className="topbar-separator" />
        <span className="product-name">Route intelligence</span>
        <nav className="topnav" aria-label="Main navigation">
          <button className="active" onClick={() => setModal(null)}>
            Route planner
          </button>
          <button onClick={() => setModal('method')}>
            How it works <ArrowUpRight size={13} />
          </button>
        </nav>
        <div className="topbar-right">
          <button className="saved-trips-button" onClick={() => setModal('saved')}>
            <BookmarkSimple size={17} /> Saved trips
          </button>
        </div>
      </header>

      <main className="main-workspace">
        <div className="page-heading">
          <div>
            <h1>Weather-aware route planner</h1>
            <p>Compare the weather your truck will meet along the way.</p>
          </div>
          <button
            className="example-button"
            aria-label="Explore example trip"
            disabled={loading}
            onClick={loadExample}
          >
            <RoadHorizon size={17} />
            <span>Load example trip</span>
          </button>
        </div>

        <div className="workspace-grid">
          <div className="planner-column">
            <section className="trip-planner" aria-labelledby="trip-heading">
              <div className="section-heading">
                <h2 id="trip-heading">Trip details</h2>
                <Truck size={21} />
              </div>
              <form onSubmit={findRoutes}>
                <div className="locations">
                  <CityInput label="Origin" value={origin} onChange={setOrigin} kind="origin" />
                  <div className="location-connector" />
                  <button
                    className="swap-button"
                    type="button"
                    aria-label="Swap origin and destination"
                    onClick={() => {
                      setOrigin(destination)
                      setDestination(origin)
                    }}
                  >
                    <ArrowsDownUp size={16} />
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
                      Your local time ·{' '}
                      {Intl.DateTimeFormat()
                        .resolvedOptions()
                        .timeZone.split('/')
                        .pop()
                        ?.replaceAll('_', ' ')}
                    </span>
                  </label>
                  <div className="input-wrap">
                    <CalendarBlank size={17} />
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
                    <label htmlFor="load">
                      Load weight <Info size={12} aria-label="Load changes wind risk" />
                    </label>
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
                    <legend>Weather every</legend>
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
                    <span className="interval-unit">miles</span>
                  </fieldset>
                </div>
                <button className="primary plan-button" type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <CircleNotch size={18} className="spin" />
                      Checking the road ahead…
                    </>
                  ) : (
                    <>
                      <NavigationArrow size={17} weight="fill" />
                      Find safest route
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>
                <div className="form-note">
                  <ShieldCheck size={14} />
                  Fetches live routes and weather forecasts.
                </div>
              </form>
            </section>

            {error && (
              <div className="error-message" role="alert">
                <Warning size={19} />
                <div>
                  {error}
                  <button onClick={loadExample}>
                    Explore the example instead <ArrowRight size={13} />
                  </button>
                </div>
                <button
                  className="error-close"
                  aria-label="Dismiss error"
                  onClick={() => setError('')}
                >
                  <X size={15} />
                </button>
              </div>
            )}
            <section
              className={`mode-notice ${plan?.mode === 'live' ? 'is-live' : ''}`}
              aria-label="Forecast data source"
            >
              <div className="mode-notice-title">
                <span className="mode-marker" />
                {plan?.mode === 'live'
                  ? 'Live weather forecast'
                  : 'Example trip · simulated weather'}
              </div>
              <p>
                {plan?.mode === 'live'
                  ? `Updated ${time(plan.generated_at)}. Route weather is checked at each arrival time.`
                  : 'Real roads with simulated weather. Find safest route fetches a live forecast for your trip.'}
              </p>
              {plan?.mode === 'demo' && (
                <button onClick={loadExample} disabled={loading}>
                  Refresh example <ArrowRight size={14} />
                </button>
              )}
            </section>
            {recommended && (
              <section className="recommendation-evidence" aria-label="Recommendation explanation">
                <div className="evidence-heading">
                  <ShieldCheck size={18} />
                  <h2>Why {recommended.name}?</h2>
                </div>
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
                <div className="evidence-tradeoff">
                  {recommendationExtraMinutes > 0
                    ? `${recommendationExtraMinutes} minutes longer than the fastest route. Less dangerous weather comes first.`
                    : 'Also the fastest route among options with the best weather risk.'}
                </div>
                <button onClick={() => setModal('method')}>
                  How routes are ranked <ArrowUpRight size={13} />
                </button>
              </section>
            )}
          </div>

          <div className="results-column">
            <section className="map-panel" aria-label="Route overview">
              <div className="map-header">
                <div className="map-heading">
                  <span className="live-dot" />
                  <strong>
                    {plan ? (
                      <>
                        {city(plan.trip.origin.name)} <ArrowRight size={14} />{' '}
                        {city(plan.trip.destination.name)}
                      </>
                    ) : (
                      'Your trip overview'
                    )}
                  </strong>
                </div>
                <div className="map-header-actions">
                  <span className={`data-tag ${plan?.mode === 'live' ? 'live' : ''}`}>
                    {plan?.mode === 'live' ? 'Live forecast' : 'Example trip'}
                  </span>
                  <button
                    className="icon-button"
                    aria-label="Save current trip"
                    disabled={!plan}
                    onClick={saveTrip}
                  >
                    <BookmarkSimple size={18} />
                  </button>
                </div>
              </div>
              <div className="map-stage">
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
                />
                {loading && (
                  <div className="loading-map" role="status">
                    <CircleNotch size={19} className="spin" />
                    <span>Comparing roads & checking forecasts</span>
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
                <div className="weather-toggle">
                  <CloudSun size={17} />
                  <span>Weather overlay</span>
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
                {checkpoint ? (
                  <CheckpointDetail point={checkpoint} onClose={() => setCheckpoint(null)} />
                ) : (
                  selected && (
                    <div className="journey-card">
                      <div className="journey-card-top">
                        <span
                          className={
                            selected.id === plan?.recommended_id
                              ? 'recommended-text'
                              : 'alternative-text'
                          }
                        >
                          {selected.id === plan?.recommended_id ? (
                            <ShieldCheck size={16} weight="fill" />
                          ) : (
                            <RoadHorizon size={16} />
                          )}
                          {selected.id === plan?.recommended_id
                            ? `${selected.name} · Recommended`
                            : !selected.summary.eligible
                              ? 'No travel conditions ahead'
                              : `${selected.name} · Alternative`}
                        </span>
                        <button
                          className="icon-button"
                          onClick={download}
                          aria-label="Download trip data"
                        >
                          <DownloadSimple size={17} />
                        </button>
                      </div>
                      <div className="journey-stats">
                        <div>
                          <strong>{duration(selected.duration_seconds)}</strong>
                          <span>Estimated drive</span>
                        </div>
                        <div>
                          <strong>
                            {number(selected.distance_miles)}
                            <small> mi</small>
                          </strong>
                          <span>On the road</span>
                        </div>
                        <div>
                          <strong>{time(selected.arrival)}</strong>
                          <span>Arrival · local</span>
                        </div>
                      </div>
                      <button className="journey-details" onClick={() => setModal('details')}>
                        <span>
                          {selected.checkpoints.length} checkpoints <span>·</span> {selected.name}
                        </span>
                        <span>
                          View trip <ArrowRight size={14} />
                        </span>
                      </button>
                    </div>
                  )
                )}
                <div className="risk-legend">
                  <span>{legendTitle}</span>
                  <div>
                    {legendLabels.map((label, i) => (
                      <span key={label}>
                        <i style={{ background: COLORS[i] }} />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="forecast-panel">
                <div className="forecast-heading">
                  <div>
                    <Clock size={16} />
                    <strong>Weather forecast</strong>
                    <span>48-hour forecast</span>
                  </div>
                  <div className="forecast-time">
                    {plan && time(plan.corridor.times[hour])}{' '}
                    <span>
                      {plan &&
                        new Date(plan.corridor.times[hour]).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                    </span>
                  </div>
                </div>
                <div className="forecast-control">
                  <button
                    className="play-button"
                    aria-label={playing ? 'Pause forecast' : 'Play forecast'}
                    onClick={() => setPlaying(!playing)}
                    disabled={!plan}
                  >
                    {playing ? <Pause size={15} weight="fill" /> : <Play size={15} weight="fill" />}
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
                      {[0, 12, 24, 36, 48].map((h) => (
                        <button
                          key={h}
                          onClick={() => {
                            setHour(h)
                            setPlaying(false)
                          }}
                          className={h === hour ? 'active' : ''}
                        >
                          {h === 0 ? 'Now' : `+${h}h`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <span className="hour-offset">+{hour}h</span>
                </div>
                <div className="forecast-footnote">
                  Area weather preview. Route recommendations use the truck’s arrival time at each
                  checkpoint.
                </div>
              </div>
            </section>
            <section className="route-options" aria-labelledby="options-heading">
              <div className="options-heading">
                <h2 id="options-heading">
                  Your route options <span>{plan?.routes.length || '—'}</span>
                </h2>
                <button disabled={!plan} onClick={() => setModal('compare')}>
                  Compare <ArrowUpRight size={13} />
                </button>
              </div>
              {dirty && !loading && (
                <p className="dirty-note">Trip inputs changed. Update routes to apply.</p>
              )}
              {plan?.warnings.map((w) => (
                <div className="route-warning" key={w}>
                  <Warning size={15} />
                  {w}
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
                      onSelect={() => select(route.id)}
                    />
                  ))
                ) : (
                  <div className="empty-state">
                    <RoadHorizon size={35} />
                    <p>{loading ? 'Loading route options…' : 'No route options yet.'}</p>
                    <span>Plan a trip to compare the roads ahead.</span>
                  </div>
                )}
              </div>
              {recommended && (
                <div className="recommendation-note">
                  <ShieldCheck size={17} />
                  <span>Fewest Severe miles, then High miles, then average risk and time.</span>
                  <button
                    aria-label="How routes are recommended"
                    onClick={() => setModal('method')}
                  >
                    <Info size={15} />
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>
        <footer className="workspace-footer">
          <span>
            <ShieldCheck size={13} />
            Weather and load risk comparison
          </span>
          <span>
            Routing: OSRM <span>·</span> Weather:{' '}
            {plan?.mode === 'demo' ? 'Simulated example' : 'Open-Meteo'}{' '}
            <button onClick={() => setModal('method')}>
              Data & methodology <ArrowUpRight size={11} />
            </button>
          </span>
        </footer>
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
            modal === 'method'
              ? 'How Spotter chooses a route'
              : modal === 'compare'
                ? 'Compare route weather'
                : modal === 'saved'
                  ? 'Your saved trips.'
                  : `${selected?.name || 'Trip'} · Weather checkpoints`
          }
          onClose={() => setModal(null)}
          wide={modal === 'compare' || modal === 'details'}
        >
          {modal === 'method' && <Method />}
          {modal === 'compare' &&
            (plan ? (
              <>
                <p className="modal-intro">
                  Routes are ranked by severe miles, high miles, average risk, then driving time.
                  Any No Travel condition excludes a route.
                </p>
                <div className="comparison-grid">
                  {plan.routes.map((route) => (
                    <div
                      className={`comparison-route ${route.id === plan.recommended_id ? 'best' : ''}`}
                      key={route.id}
                    >
                      <span className="comparison-label">
                        {route.id === plan.recommended_id ? (
                          <>
                            <ShieldCheck size={15} />
                            Recommended
                          </>
                        ) : !route.summary.eligible ? (
                          'No Travel'
                        ) : (
                          'Alternative'
                        )}
                      </span>
                      <h3>{route.name}</h3>
                      <p>{route.road_name}</p>
                      <strong>{duration(route.duration_seconds)}</strong>
                      <span>
                        {number(route.distance_miles)} miles · {route.checkpoints.length}{' '}
                        checkpoints
                      </span>
                      <RiskBar route={route} large />
                      <dl>
                        {LABELS.map((label, i) => (
                          <div key={label}>
                            <dt>
                              <i style={{ background: COLORS[i] }} />
                              {label}
                            </dt>
                            <dd>{route.summary.risk_miles[i].toFixed(1)} mi</dd>
                          </div>
                        ))}
                        <div>
                          <dt>Average risk</dt>
                          <dd>{route.summary.average_risk.toFixed(2)} / 4</dd>
                        </div>
                      </dl>
                      <button
                        className="primary"
                        onClick={() => {
                          select(route.id)
                          setModal(null)
                        }}
                      >
                        View this route <ArrowRight size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="small-note">
                  Miles between checkpoints inherit the higher risk of their two endpoints. This is
                  an estimate between samples.
                </p>
              </>
            ) : (
              <p>Plan a trip to compare routes.</p>
            ))}
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
}: {
  route: Route
  selected: boolean
  recommended: boolean
  onSelect: () => void
}) {
  return (
    <button
      className={`route-card ${selected ? 'selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${route.name}, ${recommended ? 'recommended, ' : ''}${duration(route.duration_seconds)}, ${number(route.distance_miles)} miles`}
    >
      <div className="route-card-title">
        <span className="route-radio">{selected && <span />}</span>
        <strong>{route.name}</strong>
        {recommended ? (
          <span className="recommended-badge">
            <Check size={11} weight="bold" />
            Recommended
          </span>
        ) : (
          <RiskBadge level={route.summary.max_risk} />
        )}
      </div>
      <div className="route-card-stats">
        <strong>{duration(route.duration_seconds)}</strong>
        <span>{number(route.distance_miles)} mi</span>
        <span className="route-via">via {route.road_name}</span>
      </div>
      <RiskBar route={route} />
      <div className="route-card-bottom">
        <span>{route.checkpoints.length} checkpoints</span>
        <span>
          {route.summary.max_risk === 0 ? (
            <>
              <CheckCircle size={12} />
              Low risk throughout
            </>
          ) : (
            <>
              <i style={{ background: COLORS[route.summary.max_risk] }} />
              {LABELS[route.summary.max_risk]} risk ahead
            </>
          )}
        </span>
      </div>
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
