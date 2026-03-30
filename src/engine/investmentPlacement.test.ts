import { describe, expect, it } from 'vitest'
import {
  createDefaultCareerEvent,
  createDefaultInvestmentEvent,
} from '../events/defaults'
import { mergeEventsForDragPlacement } from '../events/mergeDragPlacement'
import { simulate, simulationHorizonMonths } from './simulate'
import {
  investmentCanPlaceAtMonth,
  investmentPlacementShortfallAtMonth,
  totalInvestmentShortfallForEventFromSnapshots,
} from './investmentPlacement'

describe('investmentPlacementShortfallAtMonth', () => {
  it('is zero when pool can cover lump + first recurring on start month', () => {
    const career = createDefaultCareerEvent(0)
    career.endMonth = null
    const inv = createDefaultInvestmentEvent(0)
    inv.startMonth = 0
    inv.initialAmount = 0
    inv.monthlyContribution = 100
    inv.contributionKind = 'recurring'
    const shortfall = investmentPlacementShortfallAtMonth(
      [career, inv],
      inv,
      0,
      null,
      30,
    )
    expect(shortfall).toBe(0)
  })

  it('is positive when only investment and default lump + recurring exceed pool', () => {
    const inv = createDefaultInvestmentEvent(0)
    const sf = investmentPlacementShortfallAtMonth([inv], inv, 0, null, 30)
    expect(sf).toBeGreaterThan(0)
  })

  it('allows placement after career has built pool (later month)', () => {
    const career = createDefaultCareerEvent(0)
    career.endMonth = null
    const inv = createDefaultInvestmentEvent(0)
    inv.initialAmount = 10_000
    const okEarly = investmentCanPlaceAtMonth([career], inv, 0, null, 30)
    expect(okEarly).toBe(false)
    const okLate = investmentCanPlaceAtMonth([career], inv, 14, null, 30)
    expect(okLate).toBe(true)
  })

  it('returns zero shortfall for non-investment drafts', () => {
    const career = createDefaultCareerEvent(0)
    const sf = investmentPlacementShortfallAtMonth([], career, 0, null, 30)
    expect(sf).toBe(0)
  })

  it('allows moving an investment back to month 0 after it was placed later (same as fresh placement at 0)', () => {
    const career = createDefaultCareerEvent(0)
    career.endMonth = null
    const inv = createDefaultInvestmentEvent(0)
    inv.initialAmount = 0
    // Default career: net ~6240/mo, savings cap 15% → pool deposit 936/mo (see simulate defaults).
    inv.monthlyContribution = 936
    inv.contributionKind = 'recurring'

    const okAt0 = investmentCanPlaceAtMonth([career, inv], inv, 0, null, 30)
    expect(okAt0).toBe(true)

    const invLate = { ...inv, startMonth: 12 }
    const eventsAfterMove = [career, invLate]
    const okBackTo0 = investmentCanPlaceAtMonth(eventsAfterMove, invLate, 0, null, 30)
    expect(okBackTo0).toBe(true)
  })

  it('rejects candidate when shortfall appears after start month (not only on drop month)', () => {
    const c1 = createDefaultCareerEvent(0)
    const c2 = createDefaultCareerEvent(12)
    c2.id = 'career-b'
    const invQuiet = createDefaultInvestmentEvent(0)
    invQuiet.id = 'inv-quiet'
    invQuiet.initialAmount = 0
    invQuiet.monthlyContribution = 0
    invQuiet.contributionKind = 'recurring'
    const invLate = createDefaultInvestmentEvent(12)
    invLate.id = 'inv-late'
    invLate.initialAmount = 0
    invLate.monthlyContribution = 10_000
    invLate.contributionKind = 'recurring'
    const events = [c1, c2, invQuiet]
    const ok = investmentCanPlaceAtMonth(events, invLate, 12, null, 30)
    expect(ok).toBe(false)
    const sf = investmentPlacementShortfallAtMonth(events, invLate, 12, null, 30)
    expect(sf).toBeGreaterThan(0)
  })
})

describe('totalInvestmentShortfallForEventFromSnapshots', () => {
  it('matches investmentPlacementShortfallAtMonth for the same merged timeline', () => {
    const c1 = createDefaultCareerEvent(0)
    c1.endMonth = null
    const inv = createDefaultInvestmentEvent(12)
    inv.initialAmount = 0
    inv.monthlyContribution = 10_000
    inv.contributionKind = 'recurring'
    const events = [c1, inv]
    const months = simulationHorizonMonths(30)
    const fromPlacement = investmentPlacementShortfallAtMonth(events, inv, 12, inv.id, 30)
    const merged = mergeEventsForDragPlacement(events, inv, 12, inv.id)
    const snaps = simulate(merged, new Date(), months)
    const fromSnaps = totalInvestmentShortfallForEventFromSnapshots(snaps, inv.id)
    expect(fromSnaps).toBeCloseTo(fromPlacement, 4)
  })
})
