export type Location = { name: string; lat: number; lon: number; timezone?: string }
export type Risk = { level: number; label: string; causes: string[] }
export type Weather = {
  wind_mph: number
  rain_in: number
  snow_in: number
  temperature_f: number
  forecast_time: string
}
export type Checkpoint = {
  id: number
  lat: number
  lon: number
  mile: number
  elapsed_seconds: number
  eta: string
  weather: Weather
  risk: Risk
}
export type RouteSummary = {
  risk_miles: number[]
  average_risk: number
  max_risk: number
  eligible: boolean
}
export type DepartureOption = {
  offset_hours: number
  departure: string
  arrival: string
} & ({ available: true; summary: RouteSummary } | { available: false; reason: string })
export type Route = {
  id: string
  name: string
  road_name: string
  via?: { lat: number; lon: number } | null
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  distance_miles: number
  duration_seconds: number
  arrival: string
  checkpoints: Checkpoint[]
  summary: RouteSummary
  departures?: DepartureOption[]
}
export type CorridorHour = { risk: number; wind_mph: number; rain_in: number; snow_in: number }
export type CorridorPoint = { lat: number; lon: number; hours: CorridorHour[] }
export type Plan = {
  mode: 'live' | 'demo'
  generated_at: string
  trip: {
    origin: Location
    destination: Location
    departure: string
    load_lb: number
    interval_miles: number
  }
  routes: Route[]
  recommended_id: string | null
  warnings: string[]
  corridor: { times: string[]; points: CorridorPoint[] }
  sources: Record<string, string>
  risk_levels: { label: string; color: string }[]
}
export const COLORS = ['#32846b', '#d9aa38', '#e98738', '#d45053', '#8c375a']
export const LABELS = ['Low', 'Moderate', 'High', 'Severe', 'No Travel']
export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
export const duration = (seconds: number) =>
  `${Math.floor(Math.round(seconds / 60) / 60)}h ${Math.round(seconds / 60) % 60}m`
export const number = (value: number) => Math.round(value).toLocaleString()
export const city = (name: string) => name.split(',')[0]
export function localInput(date = new Date(Date.now() + 3600000)) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(120000),
  })
  const data = await response
    .json()
    .catch(() => ({ error: 'The server returned an invalid response.' }))
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data as T
}
