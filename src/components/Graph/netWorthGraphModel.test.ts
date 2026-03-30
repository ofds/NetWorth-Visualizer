import { describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { simulate, simulationHorizonMonths } from '../../engine/simulate'
import {
  createDefaultCareerEvent,
  createDefaultInvestmentEvent,
  createDefaultMacroEvent,
} from '../../events/defaults'
import type { FinancialEvent } from '../../events/types'
import { hoverStateForMonth } from './netWorthGraphModel'

describe('hoverStateForMonth', () => {
  it('sets deltaVsPriorMonth to this month amount minus prior month same line', () => {
    const career = createDefaultCareerEvent(0)
    const events: FinancialEvent[] = [career]
    const months = simulationHorizonMonths(2)
    const series = simulate(events, new Date(), months)
    const h0 = hoverStateForMonth(series, 0, events, false, i18n.t.bind(i18n))
    const h1 = hoverStateForMonth(series, 1, events, false, i18n.t.bind(i18n))
    expect(h0).not.toBeNull()
    expect(h1).not.toBeNull()
    const r0 = h0!.contributionRows.find((r) => r.eventId === career.id)
    const r1 = h1!.contributionRows.find((r) => r.eventId === career.id)
    expect(r1).toBeDefined()
    const prevLine = r0?.amount ?? 0
    expect(r1!.deltaVsPriorMonth).toBeCloseTo(r1!.amount - prevLine, 2)
  })

  it('marks activeRows startsThisMonth when event start matches tooltip month', () => {
    const career = createDefaultCareerEvent(5)
    const events: FinancialEvent[] = [career]
    const series = simulate(events, new Date(), simulationHorizonMonths(12))
    const h4 = hoverStateForMonth(series, 4, events, false, i18n.t.bind(i18n))
    const h5 = hoverStateForMonth(series, 5, events, false, i18n.t.bind(i18n))
    expect(h4!.activeRows.find((r) => r.id === career.id)).toBeUndefined()
    const row5 = h5!.activeRows.find((r) => r.id === career.id)
    expect(row5).toBeDefined()
    expect(row5!.startsThisMonth).toBe(true)
    const h6 = hoverStateForMonth(series, 6, events, false, i18n.t.bind(i18n))
    const row6 = h6!.activeRows.find((r) => r.id === career.id)
    expect(row6).toBeDefined()
    expect(row6!.startsThisMonth).toBe(false)
  })

  it('has null deltaVsPriorMonth for month 0', () => {
    const career = createDefaultCareerEvent(0)
    const events: FinancialEvent[] = [career]
    const series = simulate(events, new Date(), 1)
    const h0 = hoverStateForMonth(series, 0, events, false, i18n.t.bind(i18n))
    expect(h0!.contributionRows.every((r) => r.deltaVsPriorMonth === null)).toBe(true)
  })

  it('sets netWorthDeltaVarianceVsPrior to this delta minus prior month delta from month 2', () => {
    const career = createDefaultCareerEvent(0)
    const events: FinancialEvent[] = [career]
    const months = simulationHorizonMonths(4)
    const series = simulate(events, new Date(), months)
    const h1 = hoverStateForMonth(series, 1, events, false, i18n.t.bind(i18n))
    const h2 = hoverStateForMonth(series, 2, events, false, i18n.t.bind(i18n))
    expect(h1!.netWorthDeltaVarianceVsPrior).toBeNull()
    expect(h2!.netWorthDelta).not.toBeNull()
    expect(h2!.netWorthDeltaVarianceVsPrior).toBeCloseTo(
      h2!.netWorthDelta! - h1!.netWorthDelta!,
      2,
    )
  })

  it('pool net after funding stays constant when deposit and funding are fixed (interest is separate)', () => {
    const career = createDefaultCareerEvent(0)
    career.monthlyGrossIncome = 2000
    career.effectiveTaxRate = 0
    career.savingsRate = 1
    const inv = createDefaultInvestmentEvent(0)
    inv.contributionKind = 'recurring'
    inv.monthlyContribution = 900
    inv.initialAmount = 0
    const macro = createDefaultMacroEvent(0)
    macro.annualInflationRate = 0
    macro.interestRateEnvironmentAnnual = 0.04
    const events = [macro, career, inv]
    const months = simulationHorizonMonths(30)
    const series = simulate(events, new Date(), months, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      initialSavingsPool: 0,
      defaultAnnualInflation: 0,
    })
    const h5 = hoverStateForMonth(series, 5, events, false, i18n.t.bind(i18n))
    const h20 = hoverStateForMonth(series, 20, events, false, i18n.t.bind(i18n))
    expect(h5).not.toBeNull()
    expect(h20).not.toBeNull()
    expect(h20!.poolFlowLines.some((l) => l.lineKey === 'interest' && l.kind === 'in')).toBe(true)
    expect(h5!.poolNetAfterInvestmentFunding).toBeCloseTo(h20!.poolNetAfterInvestmentFunding, 5)
    expect(h5!.poolNetAfterInvestmentFunding).toBeCloseTo(1100, 5)
  })

  it('includes loan payments as a reserve outflow line when mortgages are active', () => {
    const career = createDefaultCareerEvent(0)
    career.monthlyGrossIncome = 10_000
    career.effectiveTaxRate = 0.2
    career.savingsRate = 0.25
    const home = {
      kind: 'asset_liability' as const,
      id: 'home',
      startMonth: 0,
      endMonth: null,
      name: 'Home',
      mode: 'asset' as const,
      principal: 200_000,
      downPayment: 40_000,
      installmentSource: 'reserve' as const,
      annualApr: 0,
      termYears: 20,
      monthlyPaymentOverride: null,
      annualValueChangeRate: 0,
    }
    const events: FinancialEvent[] = [career, home]
    const series = simulate(events, new Date(), 3, {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      initialSavingsPool: 100_000,
      defaultAnnualInflation: 0,
    })
    const h1 = hoverStateForMonth(series, 1, events, false, i18n.t.bind(i18n))
    expect(h1).not.toBeNull()
    const loanLine = h1!.poolFlowLines.find((l) => l.lineKey === 'loanPayments')
    expect(loanLine).toBeDefined()
    expect(loanLine!.kind).toBe('out')
    expect(loanLine!.amount).toBeGreaterThan(0)
  })
})
