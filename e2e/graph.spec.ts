import { test, expect } from '@playwright/test'

const NWV_STORAGE_KEY = 'networth-visualizer-state-v1'

/** Must match `GRAPH_MARGIN` in src/components/Graph/GraphLayers.ts — inner plot hit testing uses these insets. */
const CHART_MARGIN = { top: 12, right: 20, bottom: 64, left: 56 } as const

/** @dnd-kit uses pointer events; HTML5 dragTo is unreliable — use mouse path. */
async function dragActiveCarouselItemToChart(
  page: import('@playwright/test').Page,
  dropXRatio: number,
) {
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
  const x = dst!.x + dst!.width * dropXRatio
  const y = dst!.y + dst!.height / 2
  await page.mouse.move(src!.x + src!.width / 2, src!.y + src!.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, y, { steps: 30 })
  await page.mouse.up()
}

/** Career first (pool builds), then investment far right so the pool can fund lump + monthly. */
async function addInvestmentViaDrag(page: import('@playwright/test').Page) {
  await page.getByRole('tab', { name: /career/i }).click()
  await dragActiveCarouselItemToChart(page, 0.12)
  await page.getByRole('tab', { name: /investment/i }).click()
  await dragActiveCarouselItemToChart(page, 0.72)
  await expect(page.getByTestId('net-worth-chart')).toBeVisible({ timeout: 15_000 })
}

test.describe('Net worth graph', () => {
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

  test('draws chart after dragging investment onto the graph', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /networth visualizer/i })).toBeVisible()

    await addInvestmentViaDrag(page)

    const chart = page.getByTestId('net-worth-chart')
    await expect(chart.locator('path')).not.toHaveCount(0)
  })

  test('chart has non-zero dimensions', async ({ page }) => {
    await page.goto('/')
    await addInvestmentViaDrag(page)

    const box = await page.getByTestId('net-worth-chart').boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(100)
    expect(box!.height).toBeGreaterThan(100)
  })

  test('asset stack layers render under the net worth line', async ({ page }) => {
    await page.goto('/')
    await addInvestmentViaDrag(page)
    await expect(page.getByTestId('nw-asset-stack')).toBeVisible({ timeout: 15_000 })
    // Stacked areas can be geometrically flat in some months; Playwright may mark paths "hidden" while still attached.
    await expect(page.locator('.nw-asset-stack-layer').first()).toBeAttached()
  })

  test('hovering the chart updates asset stack fill-opacity (highlight)', async ({ page }) => {
    await page.goto('/')
    await addInvestmentViaDrag(page)
    await expect(page.getByTestId('nw-asset-stack')).toBeVisible({ timeout: 15_000 })
    const chart = page.getByTestId('net-worth-chart')
    const cbox = await chart.boundingBox()
    expect(cbox).not.toBeNull()
    await page.mouse.move(cbox!.x + cbox!.width * 0.08, cbox!.y + cbox!.height * 0.12)
    const maxStackOpacity = () =>
      page.evaluate(() =>
        Math.max(
          0,
          ...Array.from(document.querySelectorAll('.nw-asset-stack-layer')).map((el) =>
            parseFloat((el as SVGPathElement).getAttribute('fill-opacity') || '0'),
          ),
        ),
      )
    const before = await maxStackOpacity()
    await page.mouse.move(cbox!.x + cbox!.width * 0.55, cbox!.y + cbox!.height * 0.52)
    await expect
      .poll(async () => maxStackOpacity(), { timeout: 6_000 })
      .toBeGreaterThan(before)
  })

  test('clicking the investments band toggles split colors without pinning the month', async ({
    page,
  }) => {
    // Pre-seed a career (month 0, high savings rate) + investment (month 12, $1 000/mo) so the
    // `inv` stack layer is thick enough to hit reliably without depending on drag timing.
    await page.addInitScript((key: string) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          lang: 'en',
          projectionYears: 30,
          events: [
            {
              kind: 'career',
              id: 'career-e2e-inv',
              startMonth: 0,
              endMonth: null,
              name: 'Career',
              monthlyGrossIncome: 8000,
              savingsRate: 0.5,
              effectiveTaxRate: 0.22,
              durationMonths: null,
            },
            {
              kind: 'investment',
              id: 'inv-e2e-1',
              startMonth: 12,
              endMonth: null,
              name: 'Fund',
              contributionKind: 'recurring',
              initialAmount: 0,
              monthlyContribution: 1000,
              expectedAnnualReturn: 0.07,
              assetClass: 'stocks',
              durationYears: null,
            },
          ],
        }),
      )
    }, NWV_STORAGE_KEY)

    await page.goto('/')
    await expect(page.getByTestId('net-worth-chart')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('nw-asset-stack')).toBeVisible({ timeout: 15_000 })

    const chart = page.getByTestId('net-worth-chart')
    const cbox = await chart.boundingBox()
    expect(cbox).not.toBeNull()
    const { top, left, right } = CHART_MARGIN
    const innerW = cbox!.width - left - right
    const innerH = cbox!.height - top - CHART_MARGIN.bottom

    // At mid-chart (month ~200, X ≈ 0.55), the inv band spans roughly fy=0.59–0.77 of innerH
    // (net-worth line is at ~0.59 from top; pool base is at ~0.77).  All candidates land inside
    // that band.  `force: true` bypasses the tooltip panel (z-20, anchored top-right).
    const candidates: [number, number][] = [
      [0.55, 0.68],
      [0.60, 0.65],
      [0.65, 0.62],
      [0.50, 0.70],
      [0.70, 0.60],
      [0.58, 0.72],
    ]
    let opened = false
    for (const [fx, fy] of candidates) {
      const pos = { x: left + innerW * fx, y: top + innerH * fy }
      await chart.click({ position: pos, force: true })
      if (await page.getByText(/Investments by account/i).isVisible()) {
        opened = true
        break
      }
      if ((await page.getByText(/Pinned/i).count()) > 0) {
        await chart.click({ position: pos, force: true })
      }
    }
    expect(opened).toBe(true)
    await expect(page.getByText(/Pinned/i)).toHaveCount(0)
  })
})
