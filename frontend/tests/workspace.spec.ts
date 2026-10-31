import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const captureMaps = process.env.CAPTURE_MAPS === '1'

async function openTrip(page: Page) {
  const editButton = page.getByRole('button', { name: 'Edit trip', exact: true })
  if (await editButton.isVisible()) await editButton.click()
}

async function waitForMapTiles(page: Page) {
  await expect
    .poll(() => page.locator('.leaflet-tile-loaded').count(), { timeout: 20000 })
    .toBeGreaterThan(8)
  await page.waitForTimeout(500)
  await page.waitForFunction(
    () => {
      const bounds = document.querySelector('.leaflet-container')!.getBoundingClientRect()
      const visible = Array.from(
        document.querySelectorAll<HTMLImageElement>('img.leaflet-tile'),
      ).filter((tile) => {
        const box = tile.getBoundingClientRect()
        return (
          box.right > bounds.left &&
          box.left < bounds.right &&
          box.bottom > bounds.top &&
          box.top < bounds.bottom
        )
      })
      return visible.length > 0 && visible.every((tile) => tile.complete && tile.naturalWidth > 0)
    },
    undefined,
    { timeout: 90000 },
  )
}

test.beforeEach(async ({ page }, testInfo) => {
  // External tile availability is checked separately when capturing real maps.
  // Interaction/layout checks use the real route and forecast layers.
  if (!captureMaps || !/responsive workspace/.test(testInfo.title)) {
    await page.route('https://tile.openstreetmap.org/**', (route) => route.abort())
  }
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Route B, recommended/ })).toBeVisible()
})

test('example trip, route comparison, checkpoint and export', async ({ page }) => {
  await expect(page.locator('.map-mode')).toHaveText('Demo')
  await page.getByRole('button', { name: /Route A, / }).click()
  await expect(page.getByRole('button', { name: /Route A, / })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: /View trip/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Wind gusts' })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON' }).click()
  expect((await download).suggestedFilename()).toBe('spotter-trip.json')
  await page.getByRole('button', { name: 'Show checkpoint 2 on map', exact: true }).click()
  await expect(page.getByText('Weather checkpoint', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close checkpoint' }).click()
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('Average risk', { exact: true })).toHaveCount(3)
  await page.getByRole('button', { name: 'Close dialog' }).click()
})

test('each selected road stays visible from the origin after repeated route changes', async ({
  page,
}) => {
  for (const theme of ['Dark mode', 'Light mode']) {
    await page.getByRole('button', { name: theme, exact: true }).click()
    for (const name of ['A', 'C', 'B', 'A']) {
      await page.getByRole('button', { name: new RegExp(`Route ${name}, `) }).click()
      const rendered = await page.locator('.leaflet-overlay-pane svg path').evaluateAll((paths) => {
        const roads = paths.filter(
          (path) =>
            (path.getAttribute('d') || '').includes('L') &&
            ['3', '5', '7', '9'].includes(path.getAttribute('stroke-width') || ''),
        )
        const active = roads.find(
          (path) => path.getAttribute('stroke-width') === '5',
        ) as SVGPathElement
        const start = active.getPointAtLength(0)
        const pins = paths.filter((path) =>
          ['#b2e8c6', '#254f40'].includes(path.getAttribute('fill') || ''),
        ) as SVGGraphicsElement[]
        const pin = pins[0].getBBox()
        return {
          frontmostWeight: roads.at(-1)?.getAttribute('stroke-width'),
          gap: Math.hypot(start.x - (pin.x + pin.width / 2), start.y - (pin.y + pin.height / 2)),
        }
      })
      expect(rendered.frontmostWeight, `${theme}: ${name} must remain above every other road`).toBe(
        '5',
      )
      expect(rendered.gap, `${theme}: ${name} must start at the origin pin`).toBeLessThanOrEqual(1)
    }
  }
})

test('origin and destination pins stay connected to the road at street zoom', async ({ page }) => {
  test.setTimeout(60000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: /Route A, / }).click()
  await page.getByRole('switch', { name: 'Weather overlay' }).click()
  const profile = page.getByRole('slider', { name: 'Arrival weather along selected route' })
  await profile.focus()
  await profile.press('Home')
  await page.getByRole('button', { name: 'Close checkpoint', exact: true }).click()
  for (let i = 0; i < 11; i++) {
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    // Leaflet's zoom buttons animate for 250ms; wait before the next increment.
    await page.waitForTimeout(300)
  }
  for (const endpoint of ['origin', 'destination']) {
    if (endpoint === 'destination') {
      await profile.focus()
      await profile.press('End')
      await page.getByRole('button', { name: 'Close checkpoint', exact: true }).click()
    }
    await expect
      .poll(
        () =>
          page.locator('.leaflet-overlay-pane svg').evaluate((svg, endpoint) => {
            const road = svg.querySelector('path[stroke-width="5"]') as SVGPathElement
            const point = road.getPointAtLength(endpoint === 'origin' ? 0 : road.getTotalLength())
            const pin = svg.querySelector(
              endpoint === 'origin' ? 'path[fill="#b2e8c6"]' : 'path[fill="#f17a45"]',
            ) as SVGGraphicsElement
            const bounds = pin.getBBox()
            return Math.hypot(
              point.x - (bounds.x + bounds.width / 2),
              point.y - (bounds.y + bounds.height / 2),
            )
          }, endpoint),
        { message: `${endpoint} must remain attached to the road when zoomed in`, timeout: 5000 },
      )
      .toBeLessThanOrEqual(1)
  }
})

test('forecast slider, layers and overlay', async ({ page }) => {
  await page.getByRole('tab', { name: 'Area forecast', exact: true }).click()
  const slider = page.getByRole('slider', { name: 'Forecast hours ahead' })
  await slider.fill('24')
  await expect(slider).toHaveValue('24')
  await expect(page.locator('.hour-offset')).toHaveText('+24h')
  await page.getByRole('button', { name: 'Play forecast' }).click()
  await expect(slider).not.toHaveValue('24', { timeout: 4000 })
  await page.getByRole('button', { name: 'Pause forecast' }).click()
  await page.getByRole('button', { name: 'Layers', exact: true }).click()
  await page.getByRole('button', { name: 'Wind gusts', exact: true }).click()
  await page.getByRole('switch', { name: 'Weather overlay' }).click()
  await expect(page.getByRole('switch', { name: 'Weather overlay' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
})

test('keyboard city search, load and checkpoint spacing', async ({ page }) => {
  await page.route('**/api/geocode/**', (route) =>
    route.fulfill({
      json: { results: [{ name: 'Austin, Texas, US', lat: 30.2672, lon: -97.7431 }] },
    }),
  )
  const origin = page.getByRole('combobox', { name: 'Origin' })
  await openTrip(page)
  await origin.fill('Austin')
  await expect(page.getByRole('option')).toBeVisible()
  await origin.press('ArrowDown')
  await origin.press('Enter')
  await expect(origin).toHaveValue('Austin, Texas, US')
  await page.getByRole('spinbutton', { name: /Load weight/ }).fill('45000')
  await page.getByRole('button', { name: '50', exact: true }).click()
  await page.getByRole('button', { name: 'Refresh demo', exact: true }).click()
  await expect(page.locator('.loading-map')).toBeHidden()
  if ((page.viewportSize()?.width || 1440) <= 900) {
    await expect(page.getByRole('button', { name: 'Edit trip', exact: true })).toBeVisible()
  }
  await openTrip(page)
  await expect(page.getByRole('combobox', { name: 'Origin' })).toHaveValue('Chicago, IL')
  await expect(page.getByRole('button', { name: '50', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  if ((page.viewportSize()?.width || 1440) <= 900) {
    await expect(page.locator('.planner-column .route-options')).toBeHidden()
    await page.getByRole('button', { name: 'Back to map', exact: true }).click()
  }
  await expect(page.getByRole('button', { name: /Route B, recommended/ })).toBeVisible()
})

test('recommendation tradeoff stays compact and names its baseline', async ({ page }) => {
  const tradeoff = page.locator('.route-tradeoff:visible, .mobile-tradeoff:visible')
  await expect(tradeoff).toHaveText('+20 min vs A · 75 High mi avoided')
  await expect(tradeoff).toHaveAttribute('title', /Route A, the fastest road/)
})

test('journey weather supports keyboard inspection without changing area time', async ({
  page,
}) => {
  await page.getByRole('button', { name: /Route A, / }).click()
  const profile = page.getByRole('slider', { name: 'Arrival weather along selected route' })
  await profile.focus()
  await profile.press('ArrowRight')
  await expect(profile).toHaveAttribute('aria-valuenow', '25')
  await expect(page.locator('.checkpoint-popup')).toContainText('Mile 25.0')
  await profile.press('End')
  await expect(profile).toHaveAttribute('aria-valuenow', '468')
  await expect(profile).toHaveAttribute('aria-valuetext', /arriving/)
  await page.getByRole('button', { name: 'Close checkpoint', exact: true }).click()
  await page.getByRole('tab', { name: 'Area forecast', exact: true }).click()
  await page.getByRole('slider', { name: 'Forecast hours ahead' }).fill('24')
  await page.getByRole('tab', { name: 'Along route', exact: true }).click()
  await expect(profile).toHaveAttribute('aria-valuenow', '468')
  await expect(page.getByRole('button', { name: /Route A, / })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('comparison emphasizes differences and reveals shared zero bands on demand', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('dt').filter({ hasText: 'No Travel' })).toHaveCount(0)
  await expect(dialog.locator('.comparison-difference')).toHaveCount(9)
  await page.getByRole('button', { name: 'Show all risk bands', exact: true }).click()
  await expect(dialog.locator('dt').filter({ hasText: 'No Travel' })).toHaveCount(3)
  await page.getByRole('button', { name: 'Hide shared zeros', exact: true }).click()
  await expect(dialog.locator('dt').filter({ hasText: 'No Travel' })).toHaveCount(0)
})

test('departure comparison applies a later time and recalculates the demo', async ({ page }) => {
  await page.getByRole('button', { name: 'Departure times', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Simulated weather')
  await expect(page.getByRole('row')).toHaveCount(4)
  const response = page.waitForResponse(
    (response) =>
      response.url().includes('/api/demo/') &&
      response.url().includes('departure=') &&
      response.ok(),
  )
  await page.getByRole('button', { name: 'Plan departure 2 hours later', exact: true }).click()
  const updated = await (await response).json()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.toast')).toContainText('Departure updated')
  await expect(page.locator('.map-mode')).toHaveText('Demo')
  await openTrip(page)
  const actual = await page.locator('#departure').inputValue()
  expect(new Date(actual).getTime()).toBe(new Date(updated.trip.departure).getTime())
})

test('phone targets are comfortable and the editor preserves the map context', async ({ page }) => {
  if ((page.viewportSize()?.width || 1440) > 900) return
  for (const name of [
    'Saved trips',
    'How it works',
    'Light mode',
    'Dark mode',
    'Zoom in',
    'Zoom out',
    'Fit all routes',
    'Save current trip',
    'Why Route B?',
  ]) {
    const bounds = await page.getByRole('button', { name, exact: true }).boundingBox()
    expect(bounds?.width, name).toBeGreaterThanOrEqual(44)
    expect(bounds?.height, name).toBeGreaterThanOrEqual(44)
  }
  await expect(page.locator('.route-chip-risk-label')).toHaveText(['High', 'Low', 'Moderate'])
  await openTrip(page)
  await expect(page.getByRole('dialog', { name: 'Trip planner' })).toBeVisible()
  await expect(page.locator('.planner-column .route-options')).toBeHidden()
  await expect(page.locator('.leaflet-container')).toBeVisible()
  const editor = await page.locator('.planner-column').boundingBox()
  expect(editor!.y).toBeGreaterThan(100)
  await page.getByRole('button', { name: 'Back to map', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Refresh demo', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Back to map', exact: true })).toBeFocused()
  await page.locator('#load').focus()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Trip planner' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit trip', exact: true })).toBeFocused()
})

test('departure comparison distinguishes unavailable weather from No Travel', async ({ page }) => {
  await page.route('**/api/demo/', async (route) => {
    const response = await route.fetch()
    const plan = await response.json()
    for (const road of plan.routes) {
      road.departures[1] = {
        ...road.departures[1],
        available: false,
        reason: 'Forecast unavailable for this arrival.',
      }
      delete road.departures[1].summary
      road.departures[2].summary = {
        risk_miles: [0, 0, 0, 0, road.distance_miles],
        eligible: false,
        max_risk: 4,
        average_risk: 4,
      }
    }
    await route.fulfill({ response, json: plan })
  })
  await page.reload()
  await page.getByRole('button', { name: 'Departure times', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Forecast unavailable for this arrival.')
  await expect(
    page.getByRole('button', { name: 'Plan departure 2 hours later', exact: true }),
  ).toBeDisabled()
  await expect(page.getByRole('dialog').getByText('No Travel', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).not.toContainText('same ranked weather exposure')
})

test('live provider failures retain explicitly labeled results', async ({ page }) => {
  await page.route('**/api/plan/', (route) =>
    route.fulfill({ status: 502, json: { error: 'Weather provider is unavailable.' } }),
  )
  await openTrip(page)
  await page.getByRole('button', { name: 'Find safest route', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Weather provider is unavailable.')
  await expect(page.getByText('Simulated weather', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Find safest route', exact: true })).toBeEnabled()
})

test('keeps explanation on demand and the map screen concise', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Recommendation explanation' })).toHaveCount(0)
  const visibleWordCount = await page
    .locator('body')
    .innerText()
    .then((text) => text.trim().split(/\s+/).length)
  expect(visibleWordCount).toBeLessThan(160)
  expect(await page.locator('body').innerText()).not.toContain(String.fromCharCode(0x2014))
  expect(await page.title()).not.toContain(String.fromCharCode(0x2014))
  await page.getByRole('button', { name: 'Why Route B?', exact: true }).click()
  const explanation = page.getByRole('region', { name: 'Recommendation explanation' })
  await expect(explanation.getByRole('heading', { name: 'Route B is recommended' })).toBeVisible()
  await expect(explanation.getByRole('columnheader', { name: 'Severe', exact: true })).toBeVisible()
  await expect(explanation.getByRole('columnheader', { name: 'High', exact: true })).toBeVisible()
  await expect(explanation).toContainText('75 High-risk miles avoided')
  await expect(explanation).toContainText('20 minutes longer than the fastest route')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.getByRole('button', { name: /How it works/ }).click()
  await expect(page.getByRole('dialog')).toContainText(
    'checks the weather when you will reach each checkpoint',
  )
})

test('dark and light themes cover controls, map and dialogs and persist', async ({ page }) => {
  test.setTimeout(60000)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: 'Dark mode', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: /Route B, recommended/ })).toBeVisible()
  await page.getByRole('button', { name: 'Light mode', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await page.locator('.topbar').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgb(255, 255, 255)',
  )
  await page.getByRole('button', { name: 'How it works', exact: true }).click()
  expect(
    await page.getByRole('dialog').evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe('rgb(255, 255, 255)')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('button', { name: /Route B, recommended/ })).toBeVisible()
  await page.getByRole('button', { name: 'Dark mode', exact: true }).click()
  await page.getByRole('button', { name: 'How it works', exact: true }).click()
  expect(
    await page.getByRole('dialog').evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe('rgb(20, 22, 23)')
})

test('responsive workspace has no horizontal overflow or browser errors', async ({
  page,
}, testInfo) => {
  test.setTimeout(captureMaps ? 120000 : 30000)
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  await expect(page.getByRole('button', { name: /Route B, recommended/ })).toBeVisible()
  await page.waitForTimeout(1000)
  if (captureMaps) await waitForMapTiles(page)
  expect(browserErrors).toEqual([])
  const destinationLabel = await page
    .locator('.city-map-label')
    .filter({ hasText: 'Nashville' })
    .boundingBox()
  const summary = await page.locator('.journey-card').boundingBox()
  expect(destinationLabel).not.toBeNull()
  expect(summary).not.toBeNull()
  if (destinationLabel && summary) {
    const overlaps =
      destinationLabel.x < summary.x + summary.width &&
      destinationLabel.x + destinationLabel.width > summary.x &&
      destinationLabel.y < summary.y + summary.height &&
      destinationLabel.y + destinationLabel.height > summary.y
    expect(overlaps, 'The destination label must remain clear of the trip summary').toBe(false)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  if (!captureMaps) return
  await page.screenshot({
    path: `../docs/${testInfo.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
  await page.screenshot({
    path: `../docs/${testInfo.project.name}-dark.png`,
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Light mode', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.screenshot({
    path: `../docs/${testInfo.project.name}-light.png`,
    fullPage: true,
    animations: 'disabled',
  })
})
