import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Location, Plan, RouteSummary } from '../src/types'

const cities: Record<string, Location> = {
  Austin: { name: 'Austin, Texas, US', lat: 30.2672, lon: -97.7431 },
  Houston: { name: 'Houston, Texas, US', lat: 29.7604, lon: -95.3698 },
  'San Antonio': { name: 'San Antonio, Texas, US', lat: 29.4241, lon: -98.4936 },
  Dallas: { name: 'Dallas, Texas, US', lat: 32.7767, lon: -96.797 },
}

// Deliberately small API fixtures test frontend state; real providers are
// exercised separately by scripts/smoke.py. These are not application fallbacks.
function responseFor(trip: Plan['trip'], kind: 'clear' | 'mixed' | 'blocked', count = 3): Plan {
  const departure = new Date(trip.departure).getTime()
  const routes = Array.from({ length: count }, (_, index) => {
    const distance = 160 + index * 10
    const seconds = (kind === 'mixed' ? 14400 : 7200) + index * 900
    const level = kind === 'blocked' ? 4 : kind === 'mixed' ? [2, 0, 3][index] : 0
    const riskMiles = [0, 0, 0, 0, 0]
    riskMiles[0] = level ? distance / 2 : distance
    if (level) riskMiles[level] = distance / 2
    const summary: RouteSummary = {
      risk_miles: riskMiles,
      average_risk: level / 2,
      max_risk: level,
      eligible: level < 4,
    }
    const coordinates: [number, number][] = [
      [trip.origin.lon, trip.origin.lat],
      [
        (trip.origin.lon + trip.destination.lon) / 2,
        (trip.origin.lat + trip.destination.lat) / 2 + index * 0.1,
      ],
      [trip.destination.lon, trip.destination.lat],
    ]
    const checkpoints = coordinates.map(([lon, lat], i) => {
      const risk = i === 0 ? level : 0
      return {
        id: i,
        lat,
        lon,
        mile: (i * distance) / 2,
        elapsed_seconds: (i * seconds) / 2,
        eta: new Date(departure + i * seconds * 500).toISOString(),
        weather: {
          wind_mph: risk === 4 ? 60 : 12,
          rain_in: risk === 3 ? 0.6 : risk === 2 ? 0.3 : 0,
          snow_in: 0,
          temperature_f: 68,
          forecast_time: trip.departure,
        },
        risk: {
          level: risk,
          label: ['Low', 'Moderate', 'High', 'Severe', 'No Travel'][risk],
          causes: [risk === 3 || risk === 2 ? 'Rain' : risk ? 'Wind' : 'Clear conditions'],
        },
      }
    })
    return {
      id: `route-${index + 1}`,
      name: `Route ${String.fromCharCode(65 + index)}`,
      road_name: `Test road ${index + 1}`,
      geometry: { type: 'LineString' as const, coordinates },
      distance_miles: distance,
      duration_seconds: seconds,
      arrival: new Date(departure + seconds * 1000).toISOString(),
      checkpoints,
      summary,
      departures: [0, 2, 4].map((offset) => ({
        offset_hours: offset,
        departure: new Date(departure + offset * 3600000).toISOString(),
        arrival: new Date(departure + seconds * 1000 + offset * 3600000).toISOString(),
        available: true as const,
        summary,
      })),
    }
  })
  return {
    mode: 'live',
    generated_at: new Date().toISOString(),
    trip,
    routes,
    recommended_id: kind === 'blocked' ? null : kind === 'mixed' ? 'route-2' : 'route-1',
    warnings:
      kind === 'blocked'
        ? ['No route is recommended. Every option includes No Travel conditions.']
        : [],
    corridor: {
      times: Array.from({ length: 49 }, (_, i) => new Date(Date.now() + i * 3600000).toISOString()),
      points: [],
    },
    sources: { weather: 'UI test fixture' },
    risk_levels: ['Low', 'Moderate', 'High', 'Severe', 'No Travel'].map((label) => ({
      label,
      color: '#32846b',
    })),
  }
}

const phone = (page: Page) => (page.viewportSize()?.width || 1440) <= 900
async function openEditor(page: Page) {
  if (phone(page)) await page.getByRole('button', { name: 'Edit trip', exact: true }).click()
}
async function chooseCities(page: Page, origin: string, destination: string) {
  await openEditor(page)
  for (const [label, name] of [
    ['Origin', origin],
    ['Destination', destination],
  ]) {
    await page.getByRole('combobox', { name: label, exact: true }).fill(name)
    await page.getByRole('option', { name: cities[name].name, exact: true }).click()
  }
}

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort())
  await page.route('**/api/geocode/**', (route) => {
    const query = new URL(route.request().url()).searchParams.get('q') || ''
    return route.fulfill({ json: { results: cities[query] ? [cities[query]] : [] } })
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Route B, recommended/ })).toBeVisible()
})

test('custom trips update cities, inputs, route count, ranking, weather, and explanations together', async ({
  page,
}) => {
  let requests = 0
  const sent: Plan['trip'][] = []
  await page.route('**/api/plan/', (route) => {
    requests++
    sent.push(route.request().postDataJSON())
    return route.fulfill({
      json: responseFor(
        route.request().postDataJSON(),
        requests === 1 ? 'clear' : 'mixed',
        requests === 1 ? 3 : 2,
      ),
    })
  })
  await page.getByRole('tab', { name: 'Area forecast', exact: true }).click()
  await page.getByRole('slider', { name: 'Forecast hours ahead' }).fill('24')
  await chooseCities(page, 'Austin', 'Houston')
  await page.getByRole('button', { name: 'Find safest route', exact: true }).click()
  await expect(page.locator('.map-context')).toContainText('Austin')
  await expect(page.locator('.map-context')).toContainText('Houston')
  await expect(page.locator('.map-mode')).toHaveText('Live')
  await expect(page.getByRole('button', { name: /Route A, recommended/ })).toBeVisible()
  await expect(page.locator('.hour-offset')).toHaveText('+0h')
  await page.getByRole('button', { name: 'Why Route A?', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Weather risk is tied. Driving time wins.')
  await expect(page.getByRole('dialog')).toContainText('All 160 miles on Route A are Low risk')
  await expect(page.getByRole('dialog')).toContainText('Austin')
  await expect(page.getByRole('dialog')).not.toContainText('Simulated weather')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await chooseCities(page, 'San Antonio', 'Dallas')
  await page.locator('#load').fill('45000')
  const changedDeparture = await page.evaluate(() => {
    const date = new Date(Date.now() + 12 * 3600000)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })
  await page.locator('#departure').fill(changedDeparture)
  await page.getByRole('button', { name: '50', exact: true }).click()
  await page.getByRole('button', { name: 'Find safest route', exact: true }).click()
  await expect(page.locator('.map-context')).toContainText('San Antonio')
  await expect(page.locator('.map-context')).toContainText('Dallas')
  const expectedDeparture = await page.evaluate(
    (value) => new Date(value).toISOString(),
    changedDeparture,
  )
  expect(sent[1].departure).toBe(expectedDeparture)
  await expect(page.getByRole('button', { name: /Route B, recommended, 4h 15m/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Route C, / })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Along route', exact: true }).click()
  await expect(
    page.getByRole('slider', { name: 'Arrival weather along selected route' }),
  ).toHaveAttribute('aria-valuemax', '170')
  await page.getByRole('button', { name: /Route A, / }).click()
  await expect(page.locator('.journey-weather-heading')).toContainText('0.30 in/hr rain')
  await page.getByRole('button', { name: /Route B, recommended/ }).click()
  await page.getByRole('button', { name: 'Why Route B?', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('80 High-risk miles avoided')
  await expect(page.getByRole('dialog')).toContainText('45,000 lb')
  await expect(page.getByRole('dialog')).toContainText('Every 50 mi')
  await expect(page.getByRole('dialog')).not.toContainText('Houston')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('San Antonio to Dallas')
  await expect(page.locator('.comparison-route')).toHaveCount(2)
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.getByRole('button', { name: 'Departure times', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('San Antonio to Dallas')
  await expect(page.getByRole('dialog')).toContainText('45,000 lb')
})

test('a sole eligible custom road explains the No Travel alternative', async ({ page }) => {
  await page.route('**/api/plan/', (route) => {
    const plan = responseFor(route.request().postDataJSON(), 'mixed', 2)
    plan.routes[0].summary = {
      risk_miles: [80, 0, 0, 0, 80],
      average_risk: 2,
      max_risk: 4,
      eligible: false,
    }
    plan.routes[0].checkpoints[0].risk = { level: 4, label: 'No Travel', causes: ['Wind'] }
    plan.routes[0].checkpoints[0].weather = {
      ...plan.routes[0].checkpoints[0].weather,
      wind_mph: 60,
      rain_in: 0,
    }
    return route.fulfill({ json: plan })
  })
  await chooseCities(page, 'Austin', 'Houston')
  await page.getByRole('button', { name: 'Find safest route', exact: true }).click()
  await page.getByRole('button', { name: 'Why Route B?', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Only road without No Travel conditions')
  await expect(dialog.getByRole('columnheader', { name: 'No Travel', exact: true })).toBeVisible()
  await expect(dialog.getByRole('row').filter({ hasText: 'Route A' })).toContainText('80 mi')
})

test('pending input changes are explicit and cannot save or apply stale trip data', async ({
  page,
}) => {
  await chooseCities(page, 'Austin', 'Houston')
  if (phone(page)) await page.getByRole('button', { name: 'Back to map', exact: true }).click()
  await expect(page.locator('.pending-result')).toContainText('Previous results')
  await expect(page.getByRole('button', { name: 'Save current trip', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Departure times', exact: true })).toBeDisabled()
  let body: Plan['trip'] | undefined
  await page.route('**/api/plan/', (route) => {
    body = route.request().postDataJSON()
    return route.fulfill({
      status: 502,
      json: { error: 'Weather provider unavailable for the new trip.' },
    })
  })
  await page.getByRole('button', { name: 'Update routes', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Weather provider unavailable for the new trip.',
  )
  expect(body?.origin.name).toBe(cities.Austin.name)
  expect(body?.destination.name).toBe(cities.Houston.name)
  await expect(page.locator('.map-mode')).toHaveText('Demo')
  await expect(page.locator('.map-context')).toContainText('Chicago')
})

test('a cancelled live request cannot replace the preserved demo', async ({ page }) => {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/plan/', async (route) => {
    const trip = route.request().postDataJSON()
    await gate
    try {
      await route.fulfill({ json: responseFor(trip, 'clear') })
    } catch {
      /* The browser may already have cancelled the request. */
    }
  })
  await chooseCities(page, 'Austin', 'Houston')
  await page.getByRole('button', { name: 'Find safest route', exact: true }).click()
  await expect(page.locator('.loading-map')).toBeVisible()
  await page.locator('.loading-map').getByRole('button', { name: 'Cancel', exact: true }).click()
  release()
  await expect(page.locator('.loading-map')).toBeHidden()
  await expect(page.locator('.map-mode')).toHaveText('Demo')
  await expect(page.locator('.map-context')).toContainText('Chicago')
  await expect(page.locator('.pending-result')).toBeVisible()
})

test('all-blocked custom results show No Travel without a recommendation', async ({ page }) => {
  await page.route('**/api/plan/', (route) =>
    route.fulfill({ json: responseFor(route.request().postDataJSON(), 'blocked') }),
  )
  await chooseCities(page, 'Austin', 'Houston')
  await page.getByRole('button', { name: 'Find safest route', exact: true }).click()
  await expect(page.locator('.map-mode')).toHaveText('Live')
  await expect(page.getByRole('button', { name: /^Why Route/ })).toHaveCount(0)
  const labels = phone(page)
    ? page.locator('.route-chip-risk-label')
    : page.locator('.route-card .risk-badge')
  await expect(labels).toHaveText(['No Travel', 'No Travel', 'No Travel'])
  if (phone(page)) await expect(page.getByRole('alert')).toContainText('No eligible road')
  else await expect(page.locator('.route-warning')).toContainText('No route is recommended')
})
