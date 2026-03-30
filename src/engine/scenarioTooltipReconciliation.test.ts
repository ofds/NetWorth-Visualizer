import { describe, expect, it } from 'vitest'
import { simulate } from './simulate'
import type { FinancialEvent } from '../events/types'

/**
 * Numbers you pasted from the tooltip (Apr / May 2028, Y3M25 → Y3M26).
 * This block only checks that those figures fit each other — no career math invented here.
 */
describe('tooltip figures (user-reported) are internally consistent', () => {
  const endPoolM25 = 104_000
  const incomeToPoolM25 = 4_000
  const endPoolM26 = 27_681
  const incomeToPoolM26 = 3_681
  const downPaymentM26 = 80_000
  const loanPaymentM26 = 2_023

  it('reserve balance: prior end − down + income to pool ≈ new end (ignores pool interest)', () => {
    const reconstructed = endPoolM25 - downPaymentM26 + incomeToPoolM26
    expect(reconstructed).toBe(endPoolM26)
  })

  it('income to pool drop matches career delta you saw (−$319)', () => {
    expect(incomeToPoolM25 - incomeToPoolM26).toBe(319)
  })

  it('implied monthly savings after loan equals income to pool when below cap (3,681 + 2,023 = 5,704)', () => {
    expect(incomeToPoolM26 + loanPaymentM26).toBe(5_704)
  })
})

/**
 * Full engine replay: fill `FIXTURE` from your forms, then remove `.skip`.
 *
 * Career form (Kaffa): monthlyGrossIncome, effectiveTaxRate, savingsRate, startMonth, endMonth
 * Asset form (Compra da casa): principal, downPayment, annualApr, termYears, monthlyPaymentOverride,
 *   startMonth (simulation month index), annualValueChangeRate, mode
 * Macro / Life / Investment: any other active events, same fields as in the editor
 * Simulation settings: baseMonthlyExpenses, initialLiquid, initialSavingsPool, defaultAnnualInflation
 */
describe.skip('engine replay from form values (un-skip after filling FIXTURE)', () => {
  const PURCHASE_MONTH = 26

  const FIXTURE = {
    /** Paste from Career event */
    career: {
      startMonth: 0,
      monthlyGrossIncome: 0,
      effectiveTaxRate: 0,
      savingsRate: 0,
    },
    /** Paste from Asset / loan event */
    asset: {
      startMonth: PURCHASE_MONTH,
      principal: 0,
      downPayment: 0,
      annualApr: 0,
      termYears: 0,
      annualValueChangeRate: 0,
      monthlyPaymentOverride: null as number | null,
    },
    /** Paste from simulation / settings */
    sim: {
      baseMonthlyExpenses: 0,
      initialLiquid: 0,
      initialSavingsPool: 0,
      defaultAnnualInflation: 0,
    },
    /** Other FinancialEvent[] (macro, life, …) — or leave empty */
    otherEvents: [] as FinancialEvent[],
  }

  it('matches tooltip snapshot at M25 and M26', () => {
    const career: FinancialEvent = {
      kind: 'career',
      id: 'fixture-career',
      name: 'Fixture',
      startMonth: FIXTURE.career.startMonth,
      endMonth: null,
      monthlyGrossIncome: FIXTURE.career.monthlyGrossIncome,
      effectiveTaxRate: FIXTURE.career.effectiveTaxRate,
      savingsRate: FIXTURE.career.savingsRate,
      durationMonths: null,
    }
    const asset: FinancialEvent = {
      kind: 'asset_liability',
      id: 'fixture-asset',
      name: 'Fixture',
      mode: 'asset',
      startMonth: FIXTURE.asset.startMonth,
      endMonth: null,
      principal: FIXTURE.asset.principal,
      downPayment: FIXTURE.asset.downPayment,
      annualApr: FIXTURE.asset.annualApr,
      termYears: FIXTURE.asset.termYears,
      monthlyPaymentOverride: FIXTURE.asset.monthlyPaymentOverride,
      annualValueChangeRate: FIXTURE.asset.annualValueChangeRate,
    }
    const events: FinancialEvent[] = [...FIXTURE.otherEvents, career, asset]
    const series = simulate(events, new Date(), PURCHASE_MONTH + 2, {
      baseMonthlyExpenses: FIXTURE.sim.baseMonthlyExpenses,
      initialLiquid: FIXTURE.sim.initialLiquid,
      initialSavingsPool: FIXTURE.sim.initialSavingsPool,
      defaultAnnualInflation: FIXTURE.sim.defaultAnnualInflation,
    })

    const s25 = series[PURCHASE_MONTH - 1]!
    const s26 = series[PURCHASE_MONTH]!

    // Replace these expects with your exact tooltip numbers once the fixture is filled.
    expect(s25.poolIncomeDeposit).toBe(4_000)
    expect(s25.savingsPool).toBe(104_000)
    expect(s26.poolAssetDownPaymentsTotal).toBe(80_000)
    expect(s26.loanPaymentsTotal).toBeCloseTo(2_023, 0)
    expect(s26.poolIncomeDeposit).toBe(3_681)
    expect(s26.savingsPool).toBe(27_681)
  })
})
