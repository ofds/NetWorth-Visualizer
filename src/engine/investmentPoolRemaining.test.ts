import { describe, expect, it } from 'vitest'
import { createDefaultEventForType } from '../events/defaults'
import type { FinancialEvent, InvestmentEvent } from '../events/types'
import {
  poolCapBeforeInitialLumpForInvestment,
  poolCapBeforeInitialLumpIgnoringPriorRecurringDebits,
  poolCapBeforeRecurringForInvestment,
  remainingDepositForRecurringAfterPriorInvestments,
} from './investmentPoolRemaining'
import { simulate, simulationHorizonMonths } from './simulate'

describe('poolCapBeforeRecurringForInvestment', () => {
  it('returns pool after prior investments take recurring, before target recurring', () => {
    const a: InvestmentEvent = {
      ...createDefaultEventForType('investment'),
      id: 'inv-a',
      name: 'A',
      startMonth: 0,
      contributionKind: 'recurring',
      monthlyContribution: 400,
      initialAmount: 0,
    }
    const b: InvestmentEvent = {
      ...createDefaultEventForType('investment'),
      id: 'inv-b',
      name: 'B',
      startMonth: 0,
      contributionKind: 'recurring',
      monthlyContribution: 100,
      initialAmount: 0,
    }
    const career: FinancialEvent = {
      ...createDefaultEventForType('career'),
      id: 'c1',
      startMonth: 0,
      monthlyGrossIncome: 10_000,
      effectiveTaxRate: 0.2,
      savingsRate: 0.2,
      endMonth: null,
    }
    const events: FinancialEvent[] = [career, a, b]
    const months = simulationHorizonMonths(30)
    const snaps = simulate(events, new Date(), months)
    const m = 0
    const row = snaps[m]!
    const capB = poolCapBeforeRecurringForInvestment(events, m, row, 'inv-b')
    const capA = poolCapBeforeRecurringForInvestment(events, m, row, 'inv-a')

    // A runs before B (array order): B’s cap is pool after A’s take, before B’s recurring.
    expect(capA).toBeGreaterThan(0)
    expect(capB).toBeGreaterThan(0)
    expect(capA).toBeGreaterThanOrEqual(capB)
    // After A takes min(400, pool), B should have strictly less headroom than full pool before A if pool was tight
    const poolAfterInterest = row.savingsPool + row.poolFundingToInvestmentsTotal
    expect(capA).toBeLessThanOrEqual(poolAfterInterest + 1e-6)
  })

  it('is zero when target is inactive at month', () => {
    const inv: InvestmentEvent = {
      ...createDefaultEventForType('investment'),
      id: 'late',
      name: 'Late',
      startMonth: 6,
      contributionKind: 'recurring',
      monthlyContribution: 100,
      initialAmount: 0,
    }
    const career: FinancialEvent = {
      ...createDefaultEventForType('career'),
      id: 'c1',
      startMonth: 0,
      monthlyGrossIncome: 8_000,
      effectiveTaxRate: 0.2,
      savingsRate: 0.15,
      endMonth: null,
    }
    const events: FinancialEvent[] = [career, inv]
    const months = simulationHorizonMonths(30)
    const snaps = simulate(events, new Date(), months)
    const row = snaps[0]!
    expect(poolCapBeforeRecurringForInvestment(events, 0, row, 'late')).toBe(0)
  })

  it('second investment (later in array) has untied = pool after first’s recurring; track = monthly deposit', () => {
    const career: FinancialEvent = {
      ...createDefaultEventForType('career'),
      id: 'c1',
      startMonth: 0,
      monthlyGrossIncome: 10_000,
      effectiveTaxRate: 0,
      savingsRate: 0.3,
      endMonth: null,
    }
    const first: InvestmentEvent = {
      ...createDefaultEventForType('investment'),
      id: 'inv-first',
      name: 'First',
      startMonth: 0,
      contributionKind: 'recurring',
      monthlyContribution: 2000,
      initialAmount: 0,
    }
    const second: InvestmentEvent = {
      ...createDefaultEventForType('investment'),
      id: 'zzz-second',
      name: 'Second',
      startMonth: 0,
      contributionKind: 'recurring',
      monthlyContribution: 0,
      initialAmount: 0,
    }
    // Like carousel: first investment row, then second (draft id sorts last by id, but array order wins)
    const events: FinancialEvent[] = [career, first, second]
    const months = simulationHorizonMonths(30)
    const snaps = simulate(events, new Date(), months)
    const row = snaps[0]!
    expect(row.poolIncomeDeposit).toBeCloseTo(3000, 5)
    const capSecond = poolCapBeforeRecurringForInvestment(events, 0, row, 'zzz-second')
    // ~3000 pool before funding − 2000 to first recurring → ~1000 for second (plus tiny interest noise)
    expect(capSecond).toBeGreaterThan(990)
    expect(capSecond).toBeLessThan(1020)
  })

  it('at max recurring cap, second investment has no per-event shortfall at reference month', () => {
    const career: FinancialEvent = {
      ...createDefaultEventForType('career'),
      id: 'c1',
      startMonth: 0,
      monthlyGrossIncome: 10_000,
      effectiveTaxRate: 0,
      savingsRate: 0.3,
      endMonth: null,
    }
    const first: InvestmentEvent = {
      ...createDefaultEventForType('investment'),
      id: 'inv-first',
      name: 'First',
      startMonth: 0,
      contributionKind: 'recurring',
      monthlyContribution: 2000,
      initialAmount: 0,
    }
    const second: InvestmentEvent = {
      ...createDefaultEventForType('investment'),
      id: 'zzz-second',
      name: 'Second',
      startMonth: 0,
      contributionKind: 'recurring',
      monthlyContribution: 0,
      initialAmount: 0,
    }
    const events: FinancialEvent[] = [career, first, second]
    const months = simulationHorizonMonths(30)
    const snapsBase = simulate(events, new Date(), months)
    const row = snapsBase[0]!
    const capSecond = poolCapBeforeRecurringForInvestment(events, 0, row, 'zzz-second')
    const atCap: InvestmentEvent = { ...second, monthlyContribution: capSecond }
    const snaps = simulate([career, first, atCap], new Date(), months)
    expect(snaps[0]!.investmentShortfallByEvent['zzz-second'] ?? 0).toBe(0)
    expect(snaps[0]!.investmentShortfall).toBe(0)
  })

  it('per-row recurring cap can exceed aggregate pool net after funding when second draft is in the snapshot', () => {
    const career: FinancialEvent = {
      ...createDefaultEventForType('career'),
      id: 'c1',
      startMonth: 0,
      monthlyGrossIncome: 10_000,
      effectiveTaxRate: 0,
      savingsRate: 0.3,
      endMonth: null,
    }
    const first: InvestmentEvent = {
      ...createDefaultEventForType('investment'),
      id: 'inv-first',
      name: 'First',
      startMonth: 0,
      contributionKind: 'recurring',
      monthlyContribution: 2000,
      initialAmount: 0,
    }
    const second: InvestmentEvent = {
      ...createDefaultEventForType('investment'),
      id: 'zzz-second',
      name: 'Second',
      startMonth: 0,
      contributionKind: 'recurring',
      monthlyContribution: 500,
      initialAmount: 0,
    }
    const events: FinancialEvent[] = [career, first, second]
    const months = simulationHorizonMonths(30)
    const row = simulate(events, new Date(), months)[0]!
    const capSecond = poolCapBeforeRecurringForInvestment(events, 0, row, 'zzz-second')
    const netAfter = row.poolIncomeDeposit - row.poolFundingToInvestmentsTotal
    expect(capSecond).toBeGreaterThan(netAfter + 1e-3)
  })
})

describe('remainingDepositForRecurringAfterPriorInvestments', () => {
  it('leaves only the unallocated share of this month’s pool deposit (e.g. 50% after 50%)', () => {
    const career: FinancialEvent = {
      ...createDefaultEventForType('career'),
      id: 'c1',
      startMonth: 0,
      monthlyGrossIncome: 10_000,
      effectiveTaxRate: 0,
      savingsRate: 0.3,
      endMonth: null,
    }
    const first: InvestmentEvent = {
      ...createDefaultEventForType('investment'),
      id: 'inv-first',
      name: 'First',
      startMonth: 0,
      contributionKind: 'recurring',
      monthlyContribution: 2000,
      initialAmount: 0,
    }
    const second: InvestmentEvent = {
      ...createDefaultEventForType('investment'),
      id: 'zzz-second',
      name: 'Second',
      startMonth: 0,
      contributionKind: 'recurring',
      monthlyContribution: 0,
      initialAmount: 0,
    }
    const events: FinancialEvent[] = [career, first, second]
    const months = simulationHorizonMonths(30)
    const row = simulate(events, new Date(), months)[0]!
    const d = row.poolIncomeDeposit
    expect(d).toBeCloseTo(3000, 5)
    const rem = remainingDepositForRecurringAfterPriorInvestments(events, 0, d, 'zzz-second')
    expect(rem).toBeCloseTo(1000, 5)
  })
})

describe('poolCapBeforeInitialLumpForInvestment', () => {
  it('second investment max initial equals pool after first’s lump (same start month)', () => {
    const career: FinancialEvent = {
      ...createDefaultEventForType('career'),
      id: 'c1',
      startMonth: 0,
      monthlyGrossIncome: 10_000,
      effectiveTaxRate: 0,
      savingsRate: 0.3,
      endMonth: null,
    }
    const first: InvestmentEvent = {
      ...createDefaultEventForType('investment'),
      id: 'inv-first',
      name: 'First',
      startMonth: 0,
      contributionKind: 'recurring',
      monthlyContribution: 0,
      initialAmount: 500,
    }
    const second: InvestmentEvent = {
      ...createDefaultEventForType('investment'),
      id: 'zzz-second',
      name: 'Second',
      startMonth: 0,
      contributionKind: 'recurring',
      monthlyContribution: 0,
      initialAmount: 0,
    }
    const events: FinancialEvent[] = [career, first, second]
    const months = simulationHorizonMonths(30)
    const row = simulate(events, new Date(), months)[0]!
    const capFirst = poolCapBeforeInitialLumpForInvestment(events, 0, row, 'inv-first')
    const capSecond = poolCapBeforeInitialLumpForInvestment(events, 0, row, 'zzz-second')
    expect(capFirst).toBeGreaterThan(500)
    expect(capSecond).toBeGreaterThan(0)
    expect(capSecond).toBeCloseTo(capFirst - 500, 5)
  })
})

describe('lump sum + recurring same month', () => {
  it('20k lump then 2k recurring: full deposit share and pool liquidity for second (20k saved + 2k deposit)', () => {
  const career: FinancialEvent = {
    ...createDefaultEventForType('career'),
    id: 'c1',
    startMonth: 0,
    monthlyGrossIncome: 10_000,
    effectiveTaxRate: 0,
    savingsRate: 0.2,
    endMonth: null,
  }
  const lump: InvestmentEvent = {
    ...createDefaultEventForType('investment'),
    id: 'inv-lump',
    name: 'Lump',
    startMonth: 0,
    contributionKind: 'lump_sum',
    monthlyContribution: 0,
    initialAmount: 20_000,
  }
  const recurring: InvestmentEvent = {
    ...createDefaultEventForType('investment'),
    id: 'zzz-recurring',
    name: 'Recurring',
    startMonth: 0,
    contributionKind: 'recurring',
    monthlyContribution: 2000,
    initialAmount: 0,
  }
  const events: FinancialEvent[] = [career, lump, recurring]
  const months = simulationHorizonMonths(12)
  const row = simulate(events, new Date(), months, {
    baseMonthlyExpenses: 0,
    initialLiquid: 0,
    initialSavingsPool: 20_000,
    defaultAnnualInflation: 0,
  })[0]!
  expect(row.poolIncomeDeposit).toBeCloseTo(2000, 3)
  expect(row.investmentShortfall).toBeLessThan(0.5)
  const rem = remainingDepositForRecurringAfterPriorInvestments(
    events,
    0,
    row.poolIncomeDeposit,
    'zzz-recurring',
  )
  const cap = poolCapBeforeRecurringForInvestment(events, 0, row, 'zzz-recurring')
  expect(rem).toBeCloseTo(2000, 3)
  expect(cap).toBeGreaterThan(1990)
  expect(Math.min(cap, rem)).toBeGreaterThan(1990)
  })
})

describe('poolCapBeforeInitialLumpIgnoringPriorRecurringDebits', () => {
  it('does not subtract prior recurring debits from the cap (same month)', () => {
    const career: FinancialEvent = {
      ...createDefaultEventForType('career'),
      id: 'c1',
      startMonth: 0,
      monthlyGrossIncome: 10_000,
      effectiveTaxRate: 0,
      savingsRate: 0.3,
      endMonth: null,
    }
    const first: InvestmentEvent = {
      ...createDefaultEventForType('investment'),
      id: 'inv-first',
      name: 'First',
      startMonth: 0,
      contributionKind: 'recurring',
      monthlyContribution: 2000,
      initialAmount: 0,
    }
    const second: InvestmentEvent = {
      ...createDefaultEventForType('investment'),
      id: 'zzz-second',
      name: 'Second',
      startMonth: 0,
      contributionKind: 'recurring',
      monthlyContribution: 0,
      initialAmount: 0,
    }
    const events: FinancialEvent[] = [career, first, second]
    const months = simulationHorizonMonths(30)
    const row = simulate(events, new Date(), months)[0]!
    const strict = poolCapBeforeInitialLumpForInvestment(events, 0, row, 'zzz-second')
    const friendly = poolCapBeforeInitialLumpIgnoringPriorRecurringDebits(events, 0, row, 'zzz-second')
    expect(friendly).toBeGreaterThan(strict)
    expect(friendly).toBeCloseTo(
      poolCapBeforeInitialLumpForInvestment(events, 0, row, 'inv-first'),
      5,
    )
  })
})
