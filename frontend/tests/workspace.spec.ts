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

test('forecast slider, layers and overlay', async ({ page }) => {
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
  if ((page.viewportSize()?.width || 1440) <= 900) {
    await expect(page.getByRole('button', { name: 'Edit trip', exact: true })).toBeVisible()
  }
  await openTrip(page)
  await expect(page.getByRole('combobox', { name: 'Origin' })).toHaveValue('Chicago, IL')
  await expect(page.getByRole('button', { name: '50', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: /Route B, recommended/ })).toBeVisible()
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
  await expect(explanation).toContainText('Severe weather')
  await expect(explanation).toContainText('High-risk weather')
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
