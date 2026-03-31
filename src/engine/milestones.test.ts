import { describe, expect, it } from 'vitest'
import { detectMilestones } from './milestones'
import type { MonthSnapshot } from './types'

function snap(month: number, netWorth: number): MonthSnapshot {
  return {
    month,
    date: new Date(Date.UTC(2024, month, 15)),
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
    totalAssets: netWorth,
    totalLiabilities: 0,
    netWorth,
    realNetWorth: netWorth,
    assetBreakdown: [],
    activeEvents: [],
    eventMonthContributions: [],
  }
}

describe('detectMilestones', () => {
  it('returns empty for empty snapshots', () => {
    expect(detectMilestones([])).toEqual([])
  })

  it('records first crossing month for each fixed threshold', () => {
    const data: MonthSnapshot[] = [
      snap(0, 50_000),
      snap(1, 120_000),
      snap(2, 600_000),
      snap(3, 1_100_000),
    ]
    const m = detectMilestones(data)
    expect(m.map((x) => x.value)).toEqual([100_000, 200_000, 500_000, 1_000_000])
    expect(m.map((x) => x.month)).toEqual([1, 2, 2, 3])
    expect(m[0]!.achievedAt.getTime()).toBe(data[1]!.date.getTime())
  })

  it('detects $10M when crossed', () => {
    const data: MonthSnapshot[] = [snap(0, 9_000_000), snap(1, 11_000_000)]
    const m = detectMilestones(data)
    expect(m.map((x) => x.value)).toEqual([10_000_000])
    expect(m[0]!.month).toBe(1)
  })
})
