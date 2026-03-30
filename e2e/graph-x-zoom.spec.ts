import { test, expect } from '@playwright/test'

const NWV_STORAGE_KEY = 'networth-visualizer-state-v1'

async function readZoomRangeFromStorage(page: import('@playwright/test').Page) {
  return page.evaluate((key: string) => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return undefined
      const p = JSON.parse(raw) as { graphSettings?: { zoomRange?: [number, number] | null } }
      return p.graphSettings?.zoomRange
    } catch {
      return undefined
    }
  }, NWV_STORAGE_KEY)
}

/** Same carousel flow as graph.spec — career then investment so the chart renders. */
async function addInvestmentViaDrag(page: import('@playwright/test').Page) {
  await page.getByRole('tab', { name: /career/i }).click()
  const dragBtn = page.getByRole('button', {
    name: /drag onto chart to add or move this event on the timeline/i,
  })
  await expect(dragBtn).toBeVisible()
  const drop = page.getByTestId('nw-graph-drop-zone')
  await expect(drop).toBeVisible()
  const src = await dragBtn.boundingBox()
  const dst = await drop.boundingBox()
  expect(src).not.toBeNull()
  expect(dst).not.toBeNull()
  const moveTo = (xRatio: number) => {
    const x = dst!.x + dst!.width * xRatio
    const y = dst!.y + dst!.height / 2
    return { x, y }
  }
  await page.mouse.move(src!.x + src!.width / 2, src!.y + src!.height / 2)
  await page.mouse.down()
  await page.mouse.move(moveTo(0.12).x, moveTo(0.12).y, { steps: 20 })
  await page.mouse.up()

  await page.getByRole('tab', { name: /investment/i }).click()
  await expect(dragBtn).toBeVisible()
  const src2 = await dragBtn.boundingBox()
  const dst2 = await drop.boundingBox()
  expect(src2).not.toBeNull()
  expect(dst2).not.toBeNull()
  const x = dst2!.x + dst2!.width * 0.72
  const y = dst2!.y + dst2!.height / 2
  await page.mouse.move(src2!.x + src2!.width / 2, src2!.y + src2!.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, y, { steps: 30 })
  await page.mouse.up()
  await expect(page.getByTestId('net-worth-chart')).toBeVisible({ timeout: 15_000 })
}

test.describe('Chart X drag-zoom', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((key: string) => {
      try {
        const raw = localStorage.getItem(key)
        const prev = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
        localStorage.setItem(key, JSON.stringify({ ...prev, lang: 'en' }))
      } catch {
        localStorage.setItem(key, JSON.stringify({ lang: 'en' }))
      }
    }, NWV_STORAGE_KEY)
  })

  test('brush strip is visible and horizontal drag persists zoomRange', async ({ page }) => {
    await page.goto('/')
    await addInvestmentViaDrag(page)

    const strip = page.getByTestId('nw-x-brush-strip')
    await expect(strip).toBeVisible({ timeout: 15_000 })
    const box = await strip.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(80)
    expect(box!.height).toBeGreaterThan(8)

    const y = box!.y + box!.height / 2
    const x0 = box!.x + box!.width * 0.15
    const x1 = box!.x + box!.width * 0.75
    await page.mouse.move(x0, y)
    await page.mouse.down()
    const preview = page.getByTestId('nw-x-brush-preview')
    await expect(preview).toBeVisible({ timeout: 5000 })
    await page.mouse.move(x1, y, { steps: 25 })
    await page.mouse.up()

    await expect
      .poll(async () => readZoomRangeFromStorage(page), { timeout: 5000 })
      .toEqual(expect.any(Array))
    const z = await readZoomRangeFromStorage(page)
    expect(Array.isArray(z)).toBe(true)
    expect(z![0]).toBeLessThan(z![1])
    expect(z![1] - z![0]).toBeGreaterThanOrEqual(2)

    await expect(page.getByTestId('nw-zoom-back')).toBeEnabled()
    await expect(page.getByTestId('nw-zoom-reset')).toBeEnabled()
  })

  test('preview band expands while dragging selection', async ({ page }) => {
    await page.goto('/')
    await addInvestmentViaDrag(page)

    const strip = page.getByTestId('nw-x-brush-strip')
    await expect(strip).toBeVisible({ timeout: 15_000 })
    const box = await strip.boundingBox()
    expect(box).not.toBeNull()

    const y = box!.y + box!.height / 2
    const startX = box!.x + box!.width * 0.25
    const endX = box!.x + box!.width * 0.75

    await page.mouse.move(startX, y)
    await page.mouse.down()

    const preview = page.getByTestId('nw-x-brush-preview')
    await expect(preview).toBeVisible({ timeout: 5000 })

    await expect(preview).toContainText(/M\d+/)

    const w0 = (await preview.boundingBox())?.width ?? 0
    await page.mouse.move(endX, y, { steps: 30 })
    const w1 = (await preview.boundingBox())?.width ?? 0
    await page.mouse.up()

    // Discrete selection should expand to cover multiple month columns.
    expect(w1).toBeGreaterThan(w0 + 2)
  })

  test('crosshair selection band expands while dragging', async ({ page }) => {
    await page.goto('/')
    await addInvestmentViaDrag(page)

    const strip = page.getByTestId('nw-x-brush-strip')
    await expect(strip).toBeVisible({ timeout: 15_000 })
    const box = await strip.boundingBox()
    expect(box).not.toBeNull()

    const y = box!.y + box!.height / 2
    const startX = box!.x + box!.width * 0.25
    const endX = box!.x + box!.width * 0.75

    await page.mouse.move(startX, y)
    await page.mouse.down()

    const crosshairBand = page.getByTestId('nw-x-crosshair-band')
    await expect(crosshairBand).toBeVisible({ timeout: 5000 })

    const w0 = (await crosshairBand.boundingBox())?.width ?? 0
    await page.mouse.move(endX, y, { steps: 25 })
    const w1 = (await crosshairBand.boundingBox())?.width ?? 0
    await page.mouse.up()

    expect(w1).toBeGreaterThan(w0 + 2)
  })

  test('preview renders discrete month separators', async ({ page }) => {
    await page.goto('/')
    await addInvestmentViaDrag(page)

    const strip = page.getByTestId('nw-x-brush-strip')
    await expect(strip).toBeVisible({ timeout: 15_000 })
    const box = await strip.boundingBox()
    expect(box).not.toBeNull()

    const y = box!.y + box!.height / 2
    const startX = box!.x + box!.width * 0.40
    const endX = box!.x + box!.width * 0.52

    const preview = page.getByTestId('nw-x-brush-preview')
    const monthSeps = page.getByTestId('nw-x-brush-month-sep')

    await page.mouse.move(startX, y)
    await page.mouse.down()

    await expect(preview).toBeVisible({ timeout: 5000 })
    await expect
      .poll(async () => (await monthSeps.count()) > 1, { timeout: 5000 })
      .toBe(true)

    // If the span is small enough, we should also fill columns.
    await page.mouse.move(endX, y, { steps: 20 })
    // Separators should remain present while dragging.
    await expect
      .poll(async () => (await monthSeps.count()) > 1, { timeout: 5000 })
      .toBe(true)

    await page.mouse.up()
  })

  test('right-to-left drag zooms same as left-to-right', async ({ page }) => {
    await page.goto('/')
    await addInvestmentViaDrag(page)
    const strip = page.getByTestId('nw-x-brush-strip')
    await expect(strip).toBeVisible({ timeout: 15_000 })
    const box = await strip.boundingBox()
    expect(box).not.toBeNull()
    const y = box!.y + box!.height / 2
    await page.mouse.move(box!.x + box!.width * 0.8, y)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width * 0.2, y, { steps: 25 })
    await page.mouse.up()

    await expect
      .poll(async () => readZoomRangeFromStorage(page), { timeout: 5000 })
      .toEqual(expect.any(Array))
  })

  test('zoom back after one brush restores full range (null in storage)', async ({ page }) => {
    await page.goto('/')
    await addInvestmentViaDrag(page)
    const strip = page.getByTestId('nw-x-brush-strip')
    await expect(strip).toBeVisible({ timeout: 15_000 })
    const box = await strip.boundingBox()
    expect(box).not.toBeNull()
    const y = box!.y + box!.height / 2
    await page.mouse.move(box!.x + box!.width * 0.12, y)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width * 0.78, y, { steps: 25 })
    await page.mouse.up()
    await expect
      .poll(async () => readZoomRangeFromStorage(page), { timeout: 5000 })
      .toEqual(expect.any(Array))
    await expect(page.getByTestId('nw-zoom-back')).toBeEnabled()

    await page.getByTestId('nw-zoom-back').click()
    await expect
      .poll(async () => readZoomRangeFromStorage(page), { timeout: 5000 })
      .toBeNull()
    await expect(page.getByTestId('nw-zoom-back')).toBeDisabled()
  })

  test('reset zoom clears zoomRange in storage', async ({ page }) => {
    await page.goto('/')
    await addInvestmentViaDrag(page)
    const strip = page.getByTestId('nw-x-brush-strip')
    await expect(strip).toBeVisible({ timeout: 15_000 })
    const box = await strip.boundingBox()
    expect(box).not.toBeNull()
    const y = box!.y + box!.height / 2
    await page.mouse.move(box!.x + 20, y)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width * 0.6, y, { steps: 20 })
    await page.mouse.up()

    await expect
      .poll(async () => readZoomRangeFromStorage(page), { timeout: 5000 })
      .toEqual(expect.any(Array))

    await page.getByTestId('nw-zoom-reset').click()
    await expect
      .poll(async () => readZoomRangeFromStorage(page), { timeout: 5000 })
      .toBeNull()
  })

  test('tiny brush drag does not change zoomRange', async ({ page }) => {
    await page.goto('/')
    await addInvestmentViaDrag(page)
    const strip = page.getByTestId('nw-x-brush-strip')
    await expect(strip).toBeVisible({ timeout: 15_000 })
    const before = await readZoomRangeFromStorage(page)
    const box = await strip.boundingBox()
    expect(box).not.toBeNull()
    const y = box!.y + box!.height / 2
    const mid = box!.x + box!.width * 0.5
    await page.mouse.move(mid - 2, y)
    await page.mouse.down()
    await page.mouse.move(mid + 2, y, { steps: 2 })
    await page.mouse.up()
    await page.waitForTimeout(400)
    const after = await readZoomRangeFromStorage(page)
    expect(after).toEqual(before)
  })

  test('y-axis tick labels change after zoom', async ({ page }) => {
    await page.goto('/')
    await addInvestmentViaDrag(page)

    const gridLines = page.locator('.grid-y line')
    await expect(gridLines.first()).toBeAttached({ timeout: 15_000 })

    const readYGridYs = async () => {
      const ys = await gridLines.evaluateAll((els) =>
        els.map((el) => {
          const raw = el.getAttribute('y1')
          const n = raw ? Number(raw) : Number.NaN
          return Number.isFinite(n) ? n : null
        }),
      )
      return ys.filter((v): v is number => v !== null).map((v) => Math.round(v * 10) / 10)
    }

    const before = await readYGridYs()

    const strip = page.getByTestId('nw-x-brush-strip')
    await expect(strip).toBeVisible({ timeout: 15_000 })
    const box = await strip.boundingBox()
    expect(box).not.toBeNull()
    const y = box!.y + box!.height / 2
    const x0 = box!.x + box!.width * 0.15
    const x1 = box!.x + box!.width * 0.75

    await page.mouse.move(x0, y)
    await page.mouse.down()
    await page.mouse.move(x1, y, { steps: 25 })
    await page.mouse.up()

    await expect
      .poll(async () => readZoomRangeFromStorage(page), { timeout: 5000 })
      .toEqual(expect.any(Array))

    const after = await readYGridYs()
    // Y-axis scale should change, so grid line coordinates should change too.
    expect(after).not.toEqual(before)
  })
})
