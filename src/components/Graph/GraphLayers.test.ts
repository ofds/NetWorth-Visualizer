import { describe, expect, it } from 'vitest'
import type { MonthSnapshot } from '../../engine/types'
import type { Milestone } from '../../engine/types'
import { pickYValue } from '../../engine/snapshotDisplay'
import * as d3 from 'd3'
import {
  buildLinearReferencePoints,
  calendarYearForSimulationMonth,
  eventMarkerXs,
  layoutStackedGraphEventMarkers,
  milestonePaintOrderByKey,
  milestoneSegmentHoverKey,
  milestoneSegments,
  monthColumnBandInner,
  xAxisMonthTicks,
} from './GraphLayers'

function ms(m: number, nw: number, rnw: number): MonthSnapshot {
  return {
    month: m,
    date: new Date(),
    grossIncome: 0,
    netIncome: 0,
    totalExpenses: 0,
    loanPaymentsTotal: 0,
    monthlySavings: 0,
    poolIncomeDeposit: 0,
    poolWindfallTotal: 0,
    poolAssetDownPaymentsTotal: 0,
    poolDeficitCoverTotal: 0,
    poolLoanPaymentsTotal: 0,
    liquidAssets: 0,
    savingsPool: 0,
    poolInterestEarned: 0,
    investmentShortfall: 0,
    investmentShortfallByEvent: {},
    assetDownPaymentShortfallByEvent: {},
    poolFundingToInvestmentsTotal: 0,
    investmentAssets: 0,
    investmentAssetsByEventId: {},
    physicalAssets: 0,
    totalAssets: nw,
    totalLiabilities: 0,
    netWorth: nw,
    realNetWorth: rnw,
    assetBreakdown: [],
    activeEvents: [],
    eventMonthContributions: [],
  }
}

describe('pickYValue', () => {
  it('selects field by mode', () => {
    const s = ms(0, 100, 80)
    expect(pickYValue(s, false)).toBe(100)
    expect(pickYValue(s, true)).toBe(80)
  })
})

describe('buildLinearReferencePoints', () => {
  it('interpolates endpoints in month space', () => {
    const snaps = [ms(0, 0, 0), ms(1, 50, 50), ms(2, 200, 200)]
    const pts = buildLinearReferencePoints(snaps, false)
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 200 },
    ])
  })
})

const fmtM = (m: number) => `M${m}`
const fmtY = (y: number) => `Y${y}`

describe('xAxisMonthTicks', () => {
  it('uses month labels for short horizons', () => {
    const { tickValues, format, yearTickMonths } = xAxisMonthTicks(24, fmtM, fmtY)
    expect(tickValues[0]).toBe(0)
    expect(format(0)).toMatch(/^M/)
    expect(yearTickMonths).toEqual([])
  })
  it('uses year labels for long horizons', () => {
    const { tickValues, format, yearTickMonths } = xAxisMonthTicks(360, fmtM, fmtY)
    expect(tickValues.length).toBeGreaterThan(3)
    expect(format(0)).toBe('Y1')
    expect(format(60)).toBe('Y6')
    expect(yearTickMonths).toEqual([])
  })
  it('uses calendar years on long horizons when simulationStart is provided', () => {
    const start = new Date(2025, 0, 1)
    const { format } = xAxisMonthTicks(360, fmtM, fmtY, {
      simulationStart: start,
      formatCalendarYear: (y) => String(y),
    })
    expect(format(0)).toBe('2025')
    expect(format(12)).toBe('2026')
  })
  it('returns year boundary months for short horizons with calendar options', () => {
    const { yearTickMonths } = xAxisMonthTicks(24, fmtM, fmtY, {
      simulationStart: new Date(2025, 5, 1),
      formatCalendarYear: (y) => String(y),
    })
    expect(yearTickMonths).toEqual([0, 12])
  })
})

describe('calendarYearForSimulationMonth', () => {
  it('advances by calendar year across month boundaries', () => {
    expect(calendarYearForSimulationMonth(new Date(2025, 10, 1), 2)).toBe(2026)
  })
})

describe('monthColumnBandInner', () => {
  it('tiles the plot width with midpoint boundaries for n>1', () => {
    const innerW = 100
    const xScale = d3.scaleLinear().domain([0, 2]).range([0, innerW])
    const b0 = monthColumnBandInner(0, 3, innerW, xScale)
    const b1 = monthColumnBandInner(1, 3, innerW, xScale)
    const b2 = monthColumnBandInner(2, 3, innerW, xScale)
    expect(b0.left + b0.width).toBeCloseTo(b1.left, 5)
    expect(b1.left + b1.width).toBeCloseTo(b2.left, 5)
    expect(b2.left + b2.width).toBe(innerW)
    expect(b0.left).toBe(0)
  })
})

describe('milestoneSegments', () => {
  it('tags nominal vs real when they differ in month', () => {
    const m = {
      id: 'milestone-100000-n10-r12',
      month: 10,
      value: 100_000,
      achievedAt: new Date(),
      nominalMonth: 10,
      realMonth: 12,
      achievedAtNominal: new Date(),
      achievedAtReal: new Date(),
    } satisfies Milestone
    const segs = milestoneSegments(m, 120)
    expect(segs).toEqual([
      { month: 10, kind: 'nominal' },
      { month: 12, kind: 'real' },
    ])
    expect(milestoneSegmentHoverKey(m, 'real')).toBe(`${m.id}:real`)
  })

  it('unified when nominal and real cross in the same month', () => {
    const m = {
      id: 'x',
      month: 5,
      value: 100_000,
      achievedAt: new Date(),
      nominalMonth: 5,
      realMonth: 5,
      achievedAtNominal: new Date(),
      achievedAtReal: new Date(),
    } satisfies Milestone
    expect(milestoneSegments(m, 120)).toEqual([{ month: 5, kind: 'unified' }])
  })
})

describe('milestonePaintOrderByKey', () => {
  it('moves hovered key last', () => {
    const items = [
      { hoverKey: 'a', n: 1 },
      { hoverKey: 'b', n: 2 },
    ]
    expect(milestonePaintOrderByKey(items, 'a').map((x) => x.hoverKey)).toEqual(['b', 'a'])
  })
})

describe('eventMarkerXs', () => {
  it('dedupes duplicate ids and keeps distinct events', () => {
    const dup = [
      { id: 'a', startMonth: 2, kind: 'investment' },
      { id: 'a', startMonth: 2, kind: 'investment' },
    ] as import('../../events/types').FinancialEvent[]
    expect(eventMarkerXs(dup, 10)).toEqual([{ id: 'a', month: 2 }])
    const two = [
      { id: 'a', startMonth: 1, kind: 'investment' },
      { id: 'b', startMonth: 1, kind: 'career' },
    ] as import('../../events/types').FinancialEvent[]
    expect(eventMarkerXs(two, 10)).toHaveLength(2)
  })
})

describe('layoutStackedGraphEventMarkers', () => {
  it('assigns stack indices when months map to nearby X positions', () => {
    const markers = [
      { id: 'a', month: 0 },
      { id: 'b', month: 1 },
    ]
    expect(layoutStackedGraphEventMarkers(markers, 100, 800, 26)).toEqual([
      { id: 'a', month: 0, stackIndex: 0 },
      { id: 'b', month: 1, stackIndex: 1 },
    ])
  })

  it('does not stack when X separation exceeds the gap threshold', () => {
    const markers = [
      { id: 'a', month: 0 },
      { id: 'b', month: 40 },
    ]
    expect(layoutStackedGraphEventMarkers(markers, 100, 800, 26)).toEqual([
      { id: 'a', month: 0, stackIndex: 0 },
      { id: 'b', month: 40, stackIndex: 0 },
    ])
  })
})
