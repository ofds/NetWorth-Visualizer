import { describe, expect, it } from 'vitest'
import type { InvestmentEvent } from '../events/types'
import { investmentShortfallStreakIds } from './investmentShortfallStreak'
import type { MonthSnapshot } from './types'

function snap(
  m: number,
  shortfallByEvent: Record<string, number>,
): MonthSnapshot {
  return {
    month: m,
    date: new Date(Date.UTC(2024, m, 15)),
    grossIncome: 5000,
    netIncome: 4000,
    totalExpenses: 3000,
    loanPaymentsTotal: 0,
    monthlySavings: 0,
    poolIncomeDeposit: 0,
    poolAssetDownPaymentsTotal: 0,
    poolDeficitCoverTotal: 0,
    poolLoanPaymentsTotal: 0,
    liquidAssets: 0,
    savingsPool: 0,
    poolInterestEarned: 0,
    investmentShortfall: Object.values(shortfallByEvent).reduce((a, b) => a + b, 0),
    investmentShortfallByEvent: { ...shortfallByEvent },
    assetDownPaymentShortfallByEvent: {},
    poolFundingToInvestmentsTotal: 0,
    investmentAssets: 0,
    investmentAssetsByEventId: {},
    physicalAssets: 0,
    totalAssets: 0,
    totalLiabilities: 0,
    netWorth: 0,
    realNetWorth: 0,
    assetBreakdown: [],
    activeEvents: ['inv1'],
    eventMonthContributions: [],
  }
}

const inv: InvestmentEvent = {
  kind: 'investment',
  id: 'inv1',
  startMonth: 0,
  endMonth: null,
  name: 'Fund',
  contributionKind: 'recurring',
  initialAmount: 0,
  monthlyContribution: 100,
  expectedAnnualReturn: 0.05,
  assetClass: 'stocks',
  showVolatilityCone: false,
  durationYears: 10,
}

describe('investmentShortfallStreakIds', () => {
  it('returns empty when no streak', () => {
    const data: MonthSnapshot[] = [
      snap(0, { inv1: 1 }),
      snap(1, {}),
      snap(2, { inv1: 1 }),
    ]
    expect(investmentShortfallStreakIds(data, [inv])).toEqual(new Set())
  })

  it('flags investment after 3 consecutive shortfall months', () => {
    const data: MonthSnapshot[] = [
      snap(0, { inv1: 10 }),
      snap(1, { inv1: 10 }),
      snap(2, { inv1: 10 }),
    ]
    expect(investmentShortfallStreakIds(data, [inv])).toEqual(new Set(['inv1']))
  })

  it('resets streak when shortfall clears; can cross threshold again later', () => {
    const data: MonthSnapshot[] = [
      snap(0, { inv1: 10 }),
      snap(1, { inv1: 10 }),
      snap(2, {}),
      snap(3, { inv1: 10 }),
      snap(4, { inv1: 10 }),
      snap(5, { inv1: 10 }),
    ]
    expect(investmentShortfallStreakIds(data, [inv])).toEqual(new Set(['inv1']))
  })
})
