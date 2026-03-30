import { describe, expect, it } from 'vitest'
import { mergeEventsForDragPlacement } from '../events/mergeDragPlacement'
import { createDefaultAssetLiabilityEvent, createDefaultCareerEvent } from '../events/defaults'
import { simulate, simulationHorizonMonths } from './simulate'
import {
  assetCanPlaceAtMonth,
  assetPlacementShortfallAtMonth,
  totalAssetDownPaymentShortfallForEventFromSnapshots,
} from './assetPlacement'

describe('assetPlacementShortfallAtMonth', () => {
  it('is positive when down payment exceeds reserve at drop month', () => {
    const home = createDefaultAssetLiabilityEvent(0)
    const shortfall = assetPlacementShortfallAtMonth([home], home, 0, null, 30)
    expect(shortfall).toBeGreaterThan(0)
  })

  it('is zero when career has built enough reserve by later month', () => {
    const career = createDefaultCareerEvent(0)
    career.endMonth = null
    const home = createDefaultAssetLiabilityEvent(0)
    home.downPayment = 20_000
    const okEarly = assetCanPlaceAtMonth([career], home, 0, null, 30)
    expect(okEarly).toBe(false)
    const okLate = assetCanPlaceAtMonth([career], home, 24, null, 30)
    expect(okLate).toBe(true)
  })

  /**
   * Down payment debits reserve after `surplus = min(monthlySavings, netIncome * savingsRate)` for
   * the same month (simulate.ts). Twenty deposits of 4k → 80k at month index 19 (0-based), not 20.
   */
  it('allows 80k down on first month where 20×4k has reached the pool (month index 19)', () => {
    const career = createDefaultCareerEvent(0)
    career.effectiveTaxRate = 0
    career.savingsRate = 1
    career.monthlyGrossIncome = 4000
    career.endMonth = null
    const home = createDefaultAssetLiabilityEvent(0)
    home.downPayment = 80_000
    home.principal = 400_000
    expect(assetCanPlaceAtMonth([career], home, 18, null, 30)).toBe(false)
    expect(assetCanPlaceAtMonth([career], home, 19, null, 30)).toBe(true)
  })

  it('returns zero for non-asset or liability mode', () => {
    const career = createDefaultCareerEvent(0)
    expect(assetPlacementShortfallAtMonth([], career, 0, null, 30)).toBe(0)
    const liability = createDefaultAssetLiabilityEvent(0)
    liability.mode = 'liability'
    expect(assetPlacementShortfallAtMonth([], liability, 0, null, 30)).toBe(0)
  })
})

describe('totalAssetDownPaymentShortfallForEventFromSnapshots', () => {
  it('matches assetPlacementShortfallAtMonth for the same merged timeline', () => {
    const career = createDefaultCareerEvent(0)
    career.endMonth = null
    const home = createDefaultAssetLiabilityEvent(12)
    home.mode = 'asset'
    home.downPayment = 500_000
    const events = [career, home]
    const months = simulationHorizonMonths(30)
    const fromPlacement = assetPlacementShortfallAtMonth(events, home, 12, home.id, 30)
    const merged = mergeEventsForDragPlacement(events, home, 12, home.id)
    const snaps = simulate(merged, new Date(), months)
    const fromSnaps = totalAssetDownPaymentShortfallForEventFromSnapshots(snaps, home.id)
    expect(fromSnaps).toBeCloseTo(fromPlacement, 4)
  })
})

