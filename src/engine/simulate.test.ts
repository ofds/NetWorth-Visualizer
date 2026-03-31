import { describe, expect, it } from 'vitest'
import {
  createDefaultCareerEvent,
  createDefaultInvestmentEvent,
  createDefaultLifeEvent,
  createDefaultMacroEvent,
} from '../events/defaults'
import { LEDGER_RESIDUAL_EVENT_ID } from './types'
import {
  addMonths,
  eventTimelineSegment,
  isEventActive,
  referenceCareerGrossAtMonth,
  simulate,
  simulationHorizonMonths,
} from './simulate'

describe('simulationHorizonMonths', () => {
  it('matches store recompute formula', () => {
    expect(simulationHorizonMonths(1)).toBe(12)
    expect(simulationHorizonMonths(50)).toBe(600)
    expect(simulationHorizonMonths(30)).toBe(360)
  })
})

describe('eventTimelineSegment', () => {
  it('ends first career the month before the next career starts (chain)', () => {
    const a = createDefaultCareerEvent(0)
    a.id = 'career-a'
    a.endMonth = null
    const b = createDefaultCareerEvent(24)
    b.id = 'career-b'
    b.endMonth = null
    const events = [a, b]
    const horizon = 120
    expect(eventTimelineSegment(a, events, horizon)).toEqual({ start: 0, end: 23 })
    expect(eventTimelineSegment(b, events, horizon)).toEqual({ start: 24, end: 119 })
  })

  it('respects explicit endMonth on non-career events', () => {
    const life = createDefaultLifeEvent(10)
    life.endMonth = 14
    const events = [life]
    expect(eventTimelineSegment(life, events, 60)).toEqual({ start: 10, end: 14 })
  })
})

describe('isEventActive', () => {
  const inv = createDefaultInvestmentEvent(5)
  it('is false before start', () => {
    expect(isEventActive(inv, 4)).toBe(false)
  })
  it('is true from start when end is null', () => {
    expect(isEventActive(inv, 5)).toBe(true)
    expect(isEventActive(inv, 99)).toBe(true)
  })
  it('respects inclusive endMonth', () => {
    const e = { ...inv, endMonth: 7 }
    expect(isEventActive(e, 7)).toBe(true)
    expect(isEventActive(e, 8)).toBe(false)
  })
})

describe('addMonths', () => {
  it('advances calendar months', () => {
    const d = new Date(2024, 0, 15)
    const n = addMonths(d, 2)
    expect(n.getMonth()).toBe(2)
    expect(n.getDate()).toBe(15)
  })

  it('does not skip February when the start day is 29–31', () => {
    const jan31 = new Date(2026, 0, 31)
    const feb = addMonths(jan31, 1)
    expect(feb.getMonth()).toBe(1)
    expect(feb.getDate()).toBeLessThanOrEqual(29)
    const mar = addMonths(jan31, 2)
    expect(mar.getMonth()).toBe(2)
    expect(mar.getDate()).toBe(31)
  })
})

describe('simulate', () => {
  it('returns one snapshot per month', () => {
    const out = simulate([], new Date(), 24, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      defaultAnnualInflation: 0,
    })
    expect(out).toHaveLength(24)
    expect(out[0]?.month).toBe(0)
    expect(out[23]?.month).toBe(23)
  })

  it('grows a lump-sum investment with positive return and no expenses', () => {
    const inv = createDefaultInvestmentEvent(0)
    inv.contributionKind = 'lump_sum'
    inv.initialAmount = 10_000
    inv.monthlyContribution = 0
    inv.expectedAnnualReturn = 0.12
    const out = simulate([inv], new Date(), 12, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      initialSavingsPool: 10_000,
      defaultAnnualInflation: 0,
    })
    expect(out[11]!.investmentAssets).toBeGreaterThan(10_000)
    expect(out[11]!.savingsPool).toBeGreaterThanOrEqual(0)
    expect(out[11]!.netWorth).toBeCloseTo(
      out[11]!.liquidAssets + out[11]!.savingsPool + out[11]!.investmentAssets,
      5,
    )
  })

  it('applies recurring contributions while active', () => {
    const career = createDefaultCareerEvent(0)
    career.monthlyGrossIncome = 10_000
    career.effectiveTaxRate = 0
    career.savingsRate = 1
    career.endMonth = 5
    const inv = createDefaultInvestmentEvent(0)
    inv.contributionKind = 'recurring'
    inv.initialAmount = 0
    inv.monthlyContribution = 100
    inv.expectedAnnualReturn = 0
    inv.endMonth = 5
    const out = simulate([career, inv], new Date(), 6, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      defaultAnnualInflation: 0,
    })
    expect(out[5]!.investmentAssets).toBeCloseTo(600, 5)
  })

  it('macro increases nominal expenses via inflation on base spend', () => {
    const macro = createDefaultMacroEvent(0)
    macro.annualInflationRate = 0.12
    macro.endMonth = 11
    const out = simulate([macro], new Date(), 12, {
      baseMonthlyExpenses: 1000,
      initialLiquid: 50_000,
      defaultAnnualInflation: 0,
    })
    expect(out[11]!.totalExpenses).toBeGreaterThan(1000)
  })

  it('default engine options do not charge base expenses without income (investment-only)', () => {
    const inv = createDefaultInvestmentEvent(0)
    inv.contributionKind = 'lump_sum'
    inv.initialAmount = 10_000
    inv.monthlyContribution = 0
    inv.expectedAnnualReturn = 0.06
    const out = simulate([inv], new Date(), 120, { initialSavingsPool: 10_000 })
    expect(out.every((s) => s.netWorth >= 0)).toBe(true)
    expect(out[out.length - 1]!.netWorth).toBeGreaterThan(10_000)
  })

  it('career adds only netIncome × savingsRate to pool when expenses are zero', () => {
    const career = createDefaultCareerEvent(0)
    career.monthlyGrossIncome = 10_000
    career.effectiveTaxRate = 0.2
    career.savingsRate = 0.15
    career.endMonth = 0
    const net = 10_000 * (1 - 0.2)
    const expected = net * 0.15
    const out = simulate([career], new Date(), 1, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      defaultAnnualInflation: 0,
    })
    expect(out[0]!.netWorth).toBeCloseTo(expected, 5)
    expect(out[0]!.savingsPool).toBeCloseTo(expected, 5)
    expect(out[0]!.liquidAssets).toBeCloseTo(0, 5)
    expect(out[0]!.poolIncomeDeposit).toBeCloseTo(expected, 5)
  })

  it('career-only with macro pool rate earns interest on the pool', () => {
    const career = createDefaultCareerEvent(0)
    career.monthlyGrossIncome = 8_000
    career.effectiveTaxRate = 0
    career.savingsRate = 0.25
    const macro = createDefaultMacroEvent(0)
    macro.annualInflationRate = 0
    macro.interestRateEnvironmentAnnual = 0.04
    macro.endMonth = null
    const out = simulate([macro, career], new Date(), 3, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      defaultAnnualInflation: 0,
    })
    expect(out[0]!.investmentAssets).toBe(0)
    expect(out[0]!.poolInterestEarned).toBeGreaterThan(0)
    expect(out[0]!.savingsPool).toBeGreaterThan(8_000 * 0.25)
  })

  it('career + recurring investment debits pool and grows holdings', () => {
    const career = createDefaultCareerEvent(0)
    career.monthlyGrossIncome = 12_000
    career.effectiveTaxRate = 0
    career.savingsRate = 0.5
    const macro = createDefaultMacroEvent(0)
    macro.annualInflationRate = 0
    macro.interestRateEnvironmentAnnual = 0.04
    macro.marketReturnModifierAnnual = 0
    macro.endMonth = null
    const inv = createDefaultInvestmentEvent(0)
    inv.contributionKind = 'recurring'
    inv.initialAmount = 0
    inv.monthlyContribution = 500
    inv.expectedAnnualReturn = 0.06
    const out = simulate([macro, career, inv], new Date(), 24, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      defaultAnnualInflation: 0,
    })
    expect(out[23]!.investmentAssets).toBeGreaterThan(500 * 24)
    expect(out[23]!.savingsPool).toBeGreaterThan(0)
  })

  it('without macro event pool yield is zero and simulation stays finite', () => {
    const career = createDefaultCareerEvent(0)
    career.monthlyGrossIncome = 5_000
    career.effectiveTaxRate = 0
    career.savingsRate = 0.2
    const out = simulate([career], new Date(), 6, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      defaultAnnualInflation: 0,
    })
    expect(out.every((s) => Number.isFinite(s.savingsPool))).toBe(true)
    expect(out[3]!.poolInterestEarned).toBe(0)
  })

  it('records investment shortfall when pool cannot cover scheduled contribution', () => {
    const career = createDefaultCareerEvent(0)
    career.monthlyGrossIncome = 2_000
    career.effectiveTaxRate = 0
    career.savingsRate = 1
    const inv = createDefaultInvestmentEvent(0)
    inv.contributionKind = 'recurring'
    inv.initialAmount = 0
    inv.monthlyContribution = 5_000
    inv.expectedAnnualReturn = 0
    const out = simulate([career, inv], new Date(), 2, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      defaultAnnualInflation: 0,
    })
    expect(out[0]!.investmentShortfall).toBeGreaterThan(0)
    expect(out[0]!.savingsPool).toBeGreaterThanOrEqual(0)
  })

  it('deficit months drain savings pool before liquid', () => {
    const career = createDefaultCareerEvent(0)
    career.monthlyGrossIncome = 5_000
    career.effectiveTaxRate = 0
    career.savingsRate = 1
    career.endMonth = 0
    const out = simulate([career], new Date(), 2, {
      baseMonthlyExpenses: 2_000,
      initialLiquid: 1_000,
      initialSavingsPool: 0,
      defaultAnnualInflation: 0,
    })
    expect(out[0]!.monthlySavings).toBe(3_000)
    expect(out[0]!.savingsPool).toBeCloseTo(3_000, 5)
    expect(out[1]!.monthlySavings).toBe(-2_000)
    expect(out[1]!.savingsPool).toBeCloseTo(1_000, 5)
    expect(out[1]!.liquidAssets).toBeCloseTo(1_000, 5)
  })

  it('lump sum debits pool on start month then pool continues from career surplus', () => {
    const career = createDefaultCareerEvent(0)
    career.monthlyGrossIncome = 15_000
    career.effectiveTaxRate = 0
    career.savingsRate = 1
    const inv = createDefaultInvestmentEvent(0)
    inv.contributionKind = 'lump_sum'
    inv.initialAmount = 8_000
    inv.monthlyContribution = 0
    inv.expectedAnnualReturn = 0
    const out = simulate([career, inv], new Date(), 2, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      defaultAnnualInflation: 0,
    })
    expect(out[0]!.investmentAssets).toBeCloseTo(8_000, 5)
    expect(out[0]!.investmentShortfall).toBe(0)
    expect(out[1]!.savingsPool).toBeGreaterThan(out[0]!.savingsPool)
  })

  it('chains careers so only one income job applies per month (later start = new job)', () => {
    const first = createDefaultCareerEvent(0)
    first.monthlyGrossIncome = 5_000
    first.effectiveTaxRate = 0
    first.savingsRate = 1
    first.endMonth = null
    const second = createDefaultCareerEvent(60)
    second.monthlyGrossIncome = 20_000
    second.effectiveTaxRate = 0
    second.savingsRate = 1
    second.endMonth = null
    const list = [first, second]
    const out = simulate(list, new Date(), 120, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      defaultAnnualInflation: 0,
    })
    expect(out[30]!.grossIncome).toBe(5_000)
    expect(out[59]!.grossIncome).toBe(5_000)
    expect(out[60]!.grossIncome).toBe(20_000)
    expect(referenceCareerGrossAtMonth(list, 30)).toBe(5_000)
    expect(referenceCareerGrossAtMonth(list, 60)).toBe(20_000)
  })

  it('caps earlier career when a later job starts; gap if first ends before second', () => {
    const first = createDefaultCareerEvent(0)
    first.monthlyGrossIncome = 8_000
    first.effectiveTaxRate = 0
    first.savingsRate = 1
    first.endMonth = 40
    const second = createDefaultCareerEvent(60)
    second.monthlyGrossIncome = 12_000
    second.effectiveTaxRate = 0
    second.savingsRate = 1
    const out = simulate([first, second], new Date(), 72, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      defaultAnnualInflation: 0,
    })
    expect(out[40]!.grossIncome).toBe(8_000)
    expect(out[41]!.grossIncome).toBe(0)
    expect(out[59]!.grossIncome).toBe(0)
    expect(out[60]!.grossIncome).toBe(12_000)
  })

  it('sums eventMonthContributions to monthly net worth delta (with residual if needed)', () => {
    const career = createDefaultCareerEvent(0)
    career.monthlyGrossIncome = 10_000
    career.effectiveTaxRate = 0
    career.savingsRate = 0.2
    career.endMonth = 2
    const out = simulate([career], new Date(), 3, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      initialSavingsPool: 0,
      defaultAnnualInflation: 0,
    })
    let prevNw = 0
    for (const s of out) {
      const sum = s.eventMonthContributions.reduce((a, c) => a + c.amount, 0)
      expect(sum).toBeCloseTo(s.netWorth - prevNw, 4)
      prevNw = s.netWorth
    }
  })

  it('records poolFundingToInvestmentsTotal alongside pool deposits', () => {
    const career = createDefaultCareerEvent(0)
    career.monthlyGrossIncome = 12_000
    career.effectiveTaxRate = 0
    career.savingsRate = 0.5
    const macro = createDefaultMacroEvent(0)
    macro.annualInflationRate = 0
    macro.interestRateEnvironmentAnnual = 0
    macro.endMonth = null
    const inv = createDefaultInvestmentEvent(0)
    inv.contributionKind = 'recurring'
    inv.initialAmount = 0
    inv.monthlyContribution = 500
    inv.expectedAnnualReturn = 0
    const out = simulate([macro, career, inv], new Date(), 2, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      initialSavingsPool: 0,
      defaultAnnualInflation: 0,
    })
    expect(out[0]!.poolFundingToInvestmentsTotal).toBeCloseTo(500, 5)
    expect(out[0]!.poolIncomeDeposit + out[0]!.poolInterestEarned).toBeGreaterThanOrEqual(
      out[0]!.poolFundingToInvestmentsTotal,
    )
  })

  it('attributes investment return in eventMonthContributions', () => {
    const inv = createDefaultInvestmentEvent(0)
    inv.contributionKind = 'lump_sum'
    inv.initialAmount = 10_000
    inv.monthlyContribution = 0
    inv.expectedAnnualReturn = 0.12
    const out = simulate([inv], new Date(), 2, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      initialSavingsPool: 10_000,
      defaultAnnualInflation: 0,
    })
    const ret = out[1]!.eventMonthContributions.find((c) => c.eventId === inv.id)
    expect(ret?.amount).toBeDefined()
    expect(ret!.amount).toBeGreaterThan(0)
  })

  it('merges residual bucket when ledger does not yet match delta', () => {
    const life = createDefaultLifeEvent(0)
    life.monthlyExpenseChange = 100
    const career = createDefaultCareerEvent(0)
    career.monthlyGrossIncome = 5_000
    career.effectiveTaxRate = 0
    career.savingsRate = 1
    career.endMonth = 0
    const out = simulate([life, career], new Date(), 1, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      initialSavingsPool: 0,
      defaultAnnualInflation: 0,
    })
    const residual = out[0]!.eventMonthContributions.find(
      (c) => c.eventId === LEDGER_RESIDUAL_EVENT_ID,
    )
    expect(residual).toBeDefined()
    expect(Math.abs(residual!.amount)).toBeGreaterThan(1)
  })

  it('asset down payment debits savings pool (not liquid) and pool can go negative', () => {
    const home = {
      kind: 'asset_liability' as const,
      id: 'home-test',
      startMonth: 0,
      endMonth: null,
      name: 'Home',
      mode: 'asset' as const,
      principal: 400_000,
      downPayment: 80_000,
      annualApr: 0,
      termYears: 30,
      monthlyPaymentOverride: null,
      annualValueChangeRate: 0,
    }
    const out = simulate([home], new Date(), 2, {
      initialLiquid: 0,
      initialSavingsPool: 5_000,
      defaultAnnualInflation: 0,
    })
    const financedPmt = 320_000 / 360
    expect(out[0]!.loanPaymentsTotal).toBeCloseTo(0, 5)
    expect(out[1]!.loanPaymentsTotal).toBeCloseTo(financedPmt, 5)
    expect(out[0]!.poolAssetDownPaymentsTotal).toBe(80_000)
    expect(out[0]!.liquidAssets).toBeCloseTo(0, 5)
    expect(out[0]!.savingsPool).toBeCloseTo(-75_000, 1)
    // Prior 5k in the pool remains as net equity vs house + mortgage + negative reserve.
    expect(out[0]!.netWorth).toBeCloseTo(5_000, 1)
  })

  it('asset with no starting pool leaves savings pool negative and net worth neutral at purchase', () => {
    const home = {
      kind: 'asset_liability' as const,
      id: 'home-test2',
      startMonth: 0,
      endMonth: null,
      name: 'Home',
      mode: 'asset' as const,
      principal: 400_000,
      downPayment: 80_000,
      annualApr: 0,
      termYears: 30,
      monthlyPaymentOverride: null,
      annualValueChangeRate: 0,
    }
    const out = simulate([home], new Date(), 1, {
      initialLiquid: 0,
      initialSavingsPool: 0,
      defaultAnnualInflation: 0,
    })
    expect(out[0]!.savingsPool).toBeLessThan(0)
    expect(out[0]!.liquidAssets).toBeCloseTo(0, 5)
    expect(out[0]!.netWorth).toBeCloseTo(0, 1)
  })

  it('liability-only event reduces net worth below zero when starting assets are zero', () => {
    const loan = {
      kind: 'asset_liability' as const,
      id: 'loan-test',
      startMonth: 0,
      endMonth: null,
      name: 'Loan',
      mode: 'liability' as const,
      principal: 25_000,
      downPayment: 0,
      annualApr: 0,
      termYears: 5,
      monthlyPaymentOverride: null,
      annualValueChangeRate: 0,
    }
    const out = simulate([loan], new Date(), 1, {
      initialLiquid: 0,
      initialSavingsPool: 0,
      defaultAnnualInflation: 0,
    })
    expect(out[0]!.totalLiabilities).toBeGreaterThan(0)
    expect(out[0]!.netWorth).toBeLessThan(0)
  })

  it('caps down payment to principal when configured above principal', () => {
    const home = {
      kind: 'asset_liability' as const,
      id: 'home-cap-down-payment',
      startMonth: 0,
      endMonth: null,
      name: 'Home Cap',
      mode: 'asset' as const,
      principal: 100_000,
      downPayment: 150_000,
      annualApr: 0.08,
      termYears: 20,
      monthlyPaymentOverride: null,
      annualValueChangeRate: 0,
    }
    const out = simulate([home], new Date(), 1, {
      initialLiquid: 0,
      initialSavingsPool: 200_000,
      defaultAnnualInflation: 0,
    })
    expect(out[0]!.poolAssetDownPaymentsTotal).toBe(100_000)
    expect(out[0]!.totalLiabilities).toBeCloseTo(0, 6)
  })

  it('supports SAC amortization with decreasing installment amounts', () => {
    const home = {
      kind: 'asset_liability' as const,
      id: 'home-sac',
      startMonth: 0,
      endMonth: null,
      name: 'Home SAC',
      mode: 'asset' as const,
      principal: 300_000,
      downPayment: 0,
      amortizationSystem: 'sac' as const,
      annualApr: 0.12,
      termYears: 10,
      monthlyPaymentOverride: null,
      annualValueChangeRate: 0,
    }
    const out = simulate([home], new Date(), 3, {
      baseMonthlyExpenses: 0,
      initialLiquid: 100_000,
      initialSavingsPool: 0,
      defaultAnnualInflation: 0,
    })
    expect(out[1]!.loanPaymentsTotal).toBeLessThan(out[0]!.loanPaymentsTotal)
    expect(out[2]!.loanPaymentsTotal).toBeLessThan(out[1]!.loanPaymentsTotal)
  })

  it('can pay asset installments from reserve instead of monthly expenses', () => {
    const home = {
      kind: 'asset_liability' as const,
      id: 'home-reserve-installments',
      startMonth: 0,
      endMonth: null,
      name: 'Home Reserve',
      mode: 'asset' as const,
      principal: 120_000,
      downPayment: 0,
      installmentSource: 'reserve' as const,
      annualApr: 0,
      termYears: 10,
      monthlyPaymentOverride: null,
      annualValueChangeRate: 0,
    }
    const out = simulate([home], new Date(), 1, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      initialSavingsPool: 20_000,
      defaultAnnualInflation: 0,
    })
    expect(out[0]!.loanPaymentsTotal).toBe(0)
    expect(out[0]!.poolLoanPaymentsTotal).toBe(1_000)
    expect(out[0]!.totalExpenses).toBe(0)
    expect(out[0]!.savingsPool).toBeCloseTo(20_000 - 1_000, 5)
  })

  it('credits windfall to savings pool once on start month (before asset down payment)', () => {
    const windfall = {
      kind: 'windfall' as const,
      id: 'wf-1',
      startMonth: 0,
      endMonth: 0,
      name: 'Inheritance',
      amount: 100_000,
    }
    const home = {
      kind: 'asset_liability' as const,
      id: 'home-after-windfall',
      startMonth: 0,
      endMonth: null,
      name: 'Home',
      mode: 'asset' as const,
      principal: 400_000,
      downPayment: 80_000,
      annualApr: 0,
      termYears: 30,
      monthlyPaymentOverride: null,
      annualValueChangeRate: 0,
    }
    const out = simulate([windfall, home], new Date(), 1, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      initialSavingsPool: 0,
      defaultAnnualInflation: 0,
    })
    expect(out[0]!.poolWindfallTotal).toBe(100_000)
    expect(out[0]!.poolAssetDownPaymentsTotal).toBe(80_000)
    expect(out[0]!.savingsPool).toBeCloseTo(20_000, 5)
  })

  it('credits windfall only on start month', () => {
    const windfall = {
      kind: 'windfall' as const,
      id: 'wf-2',
      startMonth: 1,
      endMonth: 1,
      name: 'Gift',
      amount: 25_000,
    }
    const out = simulate([windfall], new Date(), 3, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      initialSavingsPool: 0,
      defaultAnnualInflation: 0,
    })
    expect(out[0]!.poolWindfallTotal).toBe(0)
    expect(out[1]!.poolWindfallTotal).toBe(25_000)
    expect(out[2]!.poolWindfallTotal).toBe(0)
  })
})
