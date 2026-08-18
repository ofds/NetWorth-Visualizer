import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from '@playwright/test'

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url))
const NWV_STORAGE_KEY = 'networth-visualizer-state-v1'

test('measure load with large scenario', async ({ page }) => {
  const raw = readFileSync(path.join(SPEC_DIR, '..', 'bench', 'fixtures', 'large.json'), 'utf8')
  const fixture = JSON.parse(raw)
  await page.addInitScript(({ key, events, months }) => {
    localStorage.setItem(key, JSON.stringify({ events, projectionYears: Math.round(months / 12), currency: 'USD', lang: 'en', graphSettings: { showRealValues: false, showLinearReference: false, showMonteCarlo: false, showAssetBreakdown: false, stressTestActive: false, showLifeTimeline: true, graphTooltipOffset: {x:0,y:0}, graphTooltipWidth: 260, graphTooltipHeight: 320, zoomRange: null } }))
  }, { key: NWV_STORAGE_KEY, events: fixture.events, months: fixture.months })
  const t0 = Date.now()
  await page.goto('/')
  await page.waitForFunction(
    () =>
      (window as unknown as { __NWV_SIM_STATS__?: { calls: number } }).__NWV_SIM_STATS__
        ?.calls >= 1,
    undefined,
    { timeout: 30000 },
  )
  const t1 = Date.now()
  // chart data rendered (a path exists in the svg)
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-testid="net-worth-chart"] path').length > 1,
    undefined,
    { timeout: 30000 },
  )
  const t2 = Date.now()
  console.log(`LOAD: goto→first-sim ${t1 - t0}ms; →chart-paths ${t2 - t0}ms`)
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as
      | { domContentLoadedEventEnd: number; loadEventEnd: number; responseStart: number }
      | undefined
    return nav
      ? {
          domContentLoaded: nav.domContentLoadedEventEnd,
          load: nav.loadEventEnd,
          ttfb: nav.responseStart,
        }
      : null
  })
  console.log('NAV TIMING:', JSON.stringify(timing))
})
