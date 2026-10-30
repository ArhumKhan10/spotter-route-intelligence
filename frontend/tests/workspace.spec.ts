import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Route B, recommended/ })).toBeVisible()
})

test('example trip, route comparison, checkpoint and export', async ({ page }) => {
  await expect(page.getByText('Example trip · simulated weather')).toBeVisible()
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
  await origin.fill('Austin')
  await expect(page.getByRole('option')).toBeVisible()
  await origin.press('ArrowDown')
  await origin.press('Enter')
  await expect(origin).toHaveValue('Austin, Texas, US')
  await page.getByRole('spinbutton', { name: /Load weight/ }).fill('45000')
  await page.getByRole('button', { name: '50', exact: true }).click()
  await page.getByRole('button', { name: 'Explore example trip' }).click()
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
  await page.getByRole('button', { name: 'Find safest route', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Weather provider is unavailable.')
  await expect(page.getByText('Example trip · simulated weather')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Find safest route', exact: true })).toBeEnabled()
})

test('responsive workspace has no horizontal overflow or browser errors', async ({
  page,
}, testInfo) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  await page.reload()
  await expect(page.getByRole('button', { name: /Route B, recommended/ })).toBeVisible()
  await page.waitForTimeout(1000)
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
  await page.screenshot({ path: `../docs/${testInfo.project.name}.png`, fullPage: true })
})
