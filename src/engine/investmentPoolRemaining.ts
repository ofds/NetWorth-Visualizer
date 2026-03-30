import type { FinancialEvent } from '../events/types'
import { isEventActive, sortEventsForSimulation } from './simulate'
import type { MonthSnapshot } from './types'

/**
 * Share of **this month’s** `poolIncomeDeposit` still available for this investment’s recurring,
 * after subtracting earlier investments’ **scheduled** recurring amounts (engine order).
 * Caps the slider so e.g. 50% + 50% of income cannot be exceeded even when the savings pool
 * balance would otherwise fund more.
 */
export function remainingDepositForRecurringAfterPriorInvestments(
  events: FinancialEvent[],
  month: number,
  monthlyPoolDeposit: number,
  targetInvestmentId: string,
): number {
  const ordered = sortEventsForSimulation(events)
  const investments = ordered.filter(
    (ev): ev is Extract<FinancialEvent, { kind: 'investment' }> => ev.kind === 'investment',
  )

  let priorRecurringScheduled = 0
  for (const inv of investments) {
    if (!isEventActive(inv, month)) continue
    if (inv.id === targetInvestmentId) {
      return Math.max(0, monthlyPoolDeposit - priorRecurringScheduled)
    }
    if (inv.contributionKind === 'recurring') {
      priorRecurringScheduled += Math.max(0, inv.monthlyContribution)
    }
  }

  return 0
}

/**
 * Nominal savings pool available **immediately before** this investment’s recurring debit
 * in the same month, using the same order as `simulate` (`sortEventsForSimulation`: start
 * month, then input array order). Other investments’ lump + recurring pulls are applied
 * first so the cap reflects monthly amounts already tied up elsewhere.
 */
export function poolCapBeforeRecurringForInvestment(
  events: FinancialEvent[],
  month: number,
  snapshot: MonthSnapshot,
  targetInvestmentId: string,
): number {
  const ordered = sortEventsForSimulation(events)
  const investments = ordered.filter(
    (ev): ev is Extract<FinancialEvent, { kind: 'investment' }> => ev.kind === 'investment',
  )

  let pool = Math.max(0, snapshot.savingsPool + snapshot.poolFundingToInvestmentsTotal)

  for (const inv of investments) {
    if (!isEventActive(inv, month)) continue
    if (month === inv.startMonth && inv.initialAmount > 0) {
      const cap = Math.max(0, pool)
      pool -= Math.min(inv.initialAmount, cap)
    }
    if (inv.id === targetInvestmentId) {
      return Math.max(0, pool)
    }
    if (inv.contributionKind === 'recurring') {
      const capR = Math.max(0, pool)
      pool -= Math.min(inv.monthlyContribution, capR)
    }
  }

  return 0
}

/**
 * Savings pool available **before** this investment’s initial lump is applied (same month,
 * same order as `simulate`). Max initial lump = this value (then `min(initialAmount, pool)` in engine).
 */
export function poolCapBeforeInitialLumpForInvestment(
  events: FinancialEvent[],
  month: number,
  snapshot: MonthSnapshot,
  targetInvestmentId: string,
): number {
  const ordered = sortEventsForSimulation(events)
  const investments = ordered.filter(
    (ev): ev is Extract<FinancialEvent, { kind: 'investment' }> => ev.kind === 'investment',
  )

  let pool = Math.max(0, snapshot.savingsPool + snapshot.poolFundingToInvestmentsTotal)

  for (const inv of investments) {
    if (!isEventActive(inv, month)) continue
    if (inv.id === targetInvestmentId) {
      return Math.max(0, pool)
    }
    if (month === inv.startMonth && inv.initialAmount > 0) {
      const cap = Math.max(0, pool)
      pool -= Math.min(inv.initialAmount, cap)
    }
    if (inv.contributionKind === 'recurring') {
      const capR = Math.max(0, pool)
      pool -= Math.min(inv.monthlyContribution, capR)
    }
  }

  return 0
}

/**
 * Pool before this investment’s lump, subtracting only **prior** investments’ lumps on the same
 * month — not their recurring debits. (EventForm uses `poolCapBeforeInitialLumpForInvestment` so
 * defaults match the engine; this helper remains for tests / comparisons.)
 */
export function poolCapBeforeInitialLumpIgnoringPriorRecurringDebits(
  events: FinancialEvent[],
  month: number,
  snapshot: MonthSnapshot,
  targetInvestmentId: string,
): number {
  const ordered = sortEventsForSimulation(events)
  const investments = ordered.filter(
    (ev): ev is Extract<FinancialEvent, { kind: 'investment' }> => ev.kind === 'investment',
  )

  let pool = Math.max(0, snapshot.savingsPool + snapshot.poolFundingToInvestmentsTotal)

  for (const inv of investments) {
    if (!isEventActive(inv, month)) continue
    if (inv.id === targetInvestmentId) {
      return Math.max(0, pool)
    }
    if (month === inv.startMonth && inv.initialAmount > 0) {
      const cap = Math.max(0, pool)
      pool -= Math.min(inv.initialAmount, cap)
    }
  }

  return 0
}
