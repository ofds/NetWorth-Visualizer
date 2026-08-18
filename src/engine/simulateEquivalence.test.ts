import { describe, expect, it } from 'vitest'
import type { FinancialEvent } from '../events/types'
import { BENCH_SCENARIOS } from '../../bench/scenarios'
import { simulateReference } from './simulate.reference'
import { simulate } from './simulate'
import type { MonthSnapshot } from './types'

/**
 * Equivalence regression: the optimized `simulate` must produce BIT-IDENTICAL
 * results to the frozen reference implementation across:
 *  - the representative benchmark scenarios (small → stress);
 *  - seeded randomized fuzz scenarios exercising every event kind, overlaps,
 *    career chaining, macros, SAC/PRICE amortization, reserve installments,
 *    windfalls and savings-pool shortfalls;
 *  - degenerate/edge inputs (empty, single events, same-start careers,
 *    zero-duration horizons).
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let uid = 0
const nid = (p: string) => `${p}-${++uid}`

function randomEvents(seed: number, count: number, horizon: number): FinancialEvent[] {
  const rnd = mulberry32(seed)
  const out: FinancialEvent[] = []
  for (let i = 0; i < count; i++) {
    const kindRoll = rnd()
    const start = Math.floor(rnd() * horizon)
    const durMonths = 1 + Math.floor(rnd() * (horizon - start))
    if (kindRoll < 0.18) {
      out.push({
        kind: 'career',
        id: nid('c'),
        startMonth: start,
        endMonth: rnd() < 0.7 ? null : start + durMonths,
        name: `c${i}`,
        monthlyGrossIncome: Math.floor(rnd() * 50000),
        savingsRate: rnd(),
        effectiveTaxRate: rnd() * 0.5,
        durationMonths: rnd() < 0.7 ? null : durMonths,
      })
    } else if (kindRoll < 0.4) {
      const recurring = rnd() < 0.6
      out.push({
        kind: 'investment',
        id: nid('i'),
        startMonth: start,
        endMonth: rnd() < 0.5 ? null : start + durMonths,
        name: `i${i}`,
        contributionKind: recurring ? 'recurring' : 'lump_sum',
        initialAmount: recurring ? 0 : Math.floor(rnd() * 100000),
        monthlyContribution: recurring ? Math.floor(rnd() * 3000) : 0,
        expectedAnnualReturn: rnd() * 0.2,
        assetClass: 'stocks',
        showVolatilityCone: false,
        durationYears: null,
      })
    } else if (kindRoll < 0.6) {
      const isAsset = rnd() < 0.6
      const principal = Math.floor(rnd() * 500000)
      out.push({
        kind: 'asset_liability',
        id: nid('a'),
        startMonth: start,
        endMonth: null,
        name: `a${i}`,
        mode: isAsset ? 'asset' : 'liability',
        principal,
        downPayment: isAsset ? Math.floor(rnd() * principal) : 0,
        amortizationSystem: rnd() < 0.5 ? 'price' : 'sac',
        installmentSource: rnd() < 0.3 ? 'reserve' : 'expenses',
        annualApr: rnd() * 0.15,
        termYears: 1 + Math.floor(rnd() * 30),
        monthlyPaymentOverride: rnd() < 0.1 ? Math.floor(rnd() * 5000) : null,
        annualValueChangeRate: isAsset ? -0.1 + rnd() * 0.25 : 0,
      })
    } else if (kindRoll < 0.75) {
      out.push({
        kind: 'life',
        id: nid('l'),
        startMonth: start,
        endMonth: rnd() < 0.4 ? null : start + durMonths,
        name: `l${i}`,
        lifeKind: 'custom',
        monthlyExpenseChange: (rnd() - 0.5) * 5000,
        oneTimeCost: rnd() < 0.4 ? Math.floor(rnd() * 60000) : 0,
        durationYears: null,
        incomeImpactPercent: Math.floor(rnd() * 100),
      })
    } else if (kindRoll < 0.9) {
      out.push({
        kind: 'macro',
        id: nid('m'),
        startMonth: start,
        endMonth: start + durMonths,
        name: `m${i}`,
        annualInflationRate: rnd() * 0.15,
        marketReturnModifierAnnual: -0.3 + rnd() * 0.5,
        interestRateEnvironmentAnnual: rnd() * 0.1,
        durationYears: durMonths / 12,
        severity: 1 + Math.floor(rnd() * 10),
      })
    } else {
      out.push({
        kind: 'windfall',
        id: nid('w'),
        startMonth: start,
        endMonth: start,
        name: `w${i}`,
        amount: Math.floor(rnd() * 300000),
      })
    }
  }
  return out
}

function compareSnapshots(a: MonthSnapshot[], b: MonthSnapshot[]): void {
  expect(a.length).toBe(b.length)
  for (let i = 0; i < a.length; i++) {
    const s = a[i]!
    const r = b[i]!
    // Dates must be equal calendar values.
    expect(s.date.getTime(), `month ${i} date`).toBe(r.date.getTime())
    expect(s.month, `month ${i} month`).toBe(r.month)
    const numKeys: (keyof MonthSnapshot)[] = [
      'grossIncome',
      'netIncome',
      'totalExpenses',
      'loanPaymentsTotal',
      'monthlySavings',
      'poolIncomeDeposit',
      'poolWindfallTotal',
      'poolAssetDownPaymentsTotal',
      'poolDeficitCoverTotal',
      'poolLoanPaymentsTotal',
      'liquidAssets',
      'savingsPool',
      'poolInterestEarned',
      'investmentShortfall',
      'poolFundingToInvestmentsTotal',
      'investmentAssets',
      'physicalAssets',
      'totalAssets',
      'totalLiabilities',
      'netWorth',
      'realNetWorth',
    ]
    for (const k of numKeys) {
      expect(s[k], `month ${i} ${String(k)}`).toBe(r[k])
    }
    expect(s.investmentShortfallByEvent).toEqual(r.investmentShortfallByEvent)
    expect(s.assetDownPaymentShortfallByEvent).toEqual(r.assetDownPaymentShortfallByEvent)
    expect(s.investmentAssetsByEventId).toEqual(r.investmentAssetsByEventId)
    expect(s.activeEvents).toEqual(r.activeEvents)
    expect(s.assetBreakdown).toEqual(r.assetBreakdown)
    expect(s.eventMonthContributions).toEqual(r.eventMonthContributions)
  }
}

function runEquivalence(events: FinancialEvent[], months: number, options?: object): void {
  const start = new Date(2024, 2, 15) // mid-month start exercises addMonths clipping
  const a = simulate(events, start, months, options)
  const b = simulateReference(events, start, months, options)
  compareSnapshots(a, b)
}

describe('simulate equivalence (optimized vs frozen reference)', () => {
  it('matches on all benchmark scenarios', () => {
    for (const sc of BENCH_SCENARIOS) {
      runEquivalence(sc.events, sc.months)
    }
  })

  it('matches on randomized fuzz scenarios', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    const sizes = [0, 1, 2, 5, 10, 25, 50]
    for (const seed of seeds) {
      const count = sizes[seed % sizes.length]!
      const months = 12 * (1 + (seed % 8))
      const events = randomEvents(seed * 97, count, months)
      runEquivalence(events, months)
    }
  })

  it('matches with non-default options (pool/liquid/base expenses)', () => {
    const sc = BENCH_SCENARIOS[2]!
    runEquivalence(sc.events, sc.months, {
      baseMonthlyExpenses: 1200,
      initialLiquid: 50_000,
      initialSavingsPool: 20_000,
      defaultAnnualInflation: 0.04,
    })
  })

  it('matches when shortfall callbacks are provided', () => {
    const sc = BENCH_SCENARIOS[2]!
    const events = [...sc.events, ...randomEvents(555, 20, 300)]
    const start = new Date(2024, 2, 15)
    const cbA: { m: number; id: string; amt: number }[] = []
    const cbB: { m: number; id: string; amt: number }[] = []
    const optsA = {
      onInvestmentShortfall: (m: number, id: string, amt: number) => cbA.push({ m, id, amt }),
      onAssetDownPaymentShortfall: (m: number, id: string, amt: number) =>
        cbA.push({ m, id, amt }),
    }
    const optsB = {
      onInvestmentShortfall: (m: number, id: string, amt: number) => cbB.push({ m, id, amt }),
      onAssetDownPaymentShortfall: (m: number, id: string, amt: number) =>
        cbB.push({ m, id, amt }),
    }
    const a = simulate(events, start, 600, optsA)
    const b = simulateReference(events, start, 600, optsB)
    compareSnapshots(a, b)
    expect(cbA).toEqual(cbB)
  })

  it('matches on same-start career overlaps (tie-break by id)', () => {
    const events: FinancialEvent[] = [
      {
        kind: 'career',
        id: 'ca',
        startMonth: 5,
        endMonth: 30,
        name: 'A',
        monthlyGrossIncome: 9000,
        savingsRate: 0.2,
        effectiveTaxRate: 0.2,
        durationMonths: null,
      },
      {
        kind: 'career',
        id: 'cb',
        startMonth: 5,
        endMonth: 8,
        name: 'B',
        monthlyGrossIncome: 4000,
        savingsRate: 0.1,
        effectiveTaxRate: 0.1,
        durationMonths: null,
      },
      {
        kind: 'career',
        id: 'cc',
        startMonth: 40,
        endMonth: null,
        name: 'C',
        monthlyGrossIncome: 15000,
        savingsRate: 0.3,
        effectiveTaxRate: 0.25,
        durationMonths: null,
      },
    ]
    runEquivalence(events, 120)
  })

  it('matches on overlapping macros and zero-pool reserve borrowing', () => {
    const events: FinancialEvent[] = [
      {
        kind: 'macro',
        id: 'm1',
        startMonth: 0,
        endMonth: 20,
        name: 'M1',
        annualInflationRate: 0.06,
        marketReturnModifierAnnual: -0.1,
        interestRateEnvironmentAnnual: 0.02,
        durationYears: 2,
        severity: 5,
      },
      {
        kind: 'macro',
        id: 'm2',
        startMonth: 5,
        endMonth: 12,
        name: 'M2',
        annualInflationRate: 0.12,
        marketReturnModifierAnnual: 0.08,
        interestRateEnvironmentAnnual: 0.05,
        durationYears: 1,
        severity: 8,
      },
      {
        kind: 'asset_liability',
        id: 'home',
        startMonth: 3,
        endMonth: null,
        name: 'Home',
        mode: 'asset',
        principal: 400_000,
        downPayment: 120_000,
        amortizationSystem: 'sac',
        installmentSource: 'reserve',
        annualApr: 0.08,
        termYears: 25,
        monthlyPaymentOverride: null,
        annualValueChangeRate: 0.04,
      },
      {
        kind: 'windfall',
        id: 'w1',
        startMonth: 0,
        endMonth: 0,
        name: 'WF',
        amount: 40_000,
      },
    ]
    runEquivalence(events, 200)
  })

  it('matches on 600-month horizons (max projection)', () => {
    const events = randomEvents(2024, 40, 600)
    runEquivalence(events, 600)
  })

  it('matches on zero/one-month horizons and empty events', () => {
    runEquivalence([], 0)
    runEquivalence([], 12)
    runEquivalence(randomEvents(9, 3, 12), 1)
  })

  it('matches on degenerate events (end before start)', () => {
    const events: FinancialEvent[] = [
      {
        kind: 'investment',
        id: 'inv-weird',
        startMonth: 5,
        endMonth: 2,
        name: 'Weird inv',
        contributionKind: 'lump_sum',
        initialAmount: 10_000,
        monthlyContribution: 0,
        expectedAnnualReturn: 0.05,
        assetClass: 'custom',
        showVolatilityCone: false,
        durationYears: null,
      },
      {
        kind: 'windfall',
        id: 'wf-weird',
        startMonth: 3,
        endMonth: 1,
        name: 'Weird wf',
        amount: 5_000,
      },
      {
        kind: 'asset_liability',
        id: 'a-weird',
        startMonth: 4,
        endMonth: 2,
        name: 'Weird asset',
        mode: 'asset',
        principal: 100_000,
        downPayment: 20_000,
        annualApr: 0.05,
        termYears: 10,
        monthlyPaymentOverride: null,
        annualValueChangeRate: 0,
      },
      {
        kind: 'life',
        id: 'l-weird',
        startMonth: 6,
        endMonth: 3,
        name: 'Weird life',
        lifeKind: 'custom',
        monthlyExpenseChange: 100,
        oneTimeCost: 0,
        durationYears: null,
        incomeImpactPercent: 80,
      },
    ]
    runEquivalence(events, 12)
  })

  it('matches when events share ids or start outside horizon', () => {
    const events: FinancialEvent[] = [
      {
        kind: 'investment',
        id: 'dup',
        startMonth: 0,
        endMonth: null,
        name: 'Dup inv',
        contributionKind: 'recurring',
        initialAmount: 0,
        monthlyContribution: 100,
        expectedAnnualReturn: 0.06,
        assetClass: 'stocks',
        showVolatilityCone: false,
        durationYears: null,
      },
      {
        kind: 'investment',
        id: 'dup',
        startMonth: 0,
        endMonth: null,
        name: 'Dup inv 2',
        contributionKind: 'lump_sum',
        initialAmount: 500,
        monthlyContribution: 0,
        expectedAnnualReturn: 0.1,
        assetClass: 'bonds',
        showVolatilityCone: false,
        durationYears: null,
      },
      {
        kind: 'windfall',
        id: 'late',
        startMonth: 500,
        endMonth: 500,
        name: 'Late wf',
        amount: 10_000,
      },
    ]
    runEquivalence(events, 60)
  })
})
