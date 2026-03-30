/**
 * Pure financial helpers — architecture §5.4.
 * Rates are **annual decimals** (e.g. 0.065 = 6.5% APR).
 */

/** FV = PV × (1 + r/n)^(n×t) — default n = 12 */
export function futureValueCompound(
  presentValue: number,
  annualRate: number,
  years: number,
  periodsPerYear = 12,
): number {
  const periods = periodsPerYear * years
  if (periods === 0) return presentValue
  const r = annualRate / periodsPerYear
  return presentValue * (1 + r) ** periods
}

/**
 * Future value of end-of-period contributions.
 * FV = PMT × [((1 + r/n)^(n×t) − 1) / (r/n)]
 */
export function futureValueAnnuity(
  paymentPerPeriod: number,
  annualRate: number,
  years: number,
  periodsPerYear = 12,
): number {
  const n = periodsPerYear * years
  if (n === 0) return 0
  const rPerPeriod = annualRate / periodsPerYear
  if (Math.abs(rPerPeriod) < Number.EPSILON) {
    return paymentPerPeriod * n
  }
  return (
    paymentPerPeriod * ((1 + rPerPeriod) ** n - 1) / rPerPeriod
  )
}

/** Standard fixed-rate amortization payment (architecture §5.4) */
export function loanMonthlyPayment(
  principal: number,
  annualApr: number,
  termMonths: number,
): number {
  if (termMonths <= 0) return 0
  if (principal <= 0) return 0
  const r = annualApr / 12
  if (Math.abs(r) < Number.EPSILON) {
    return principal / termMonths
  }
  const factor = (1 + r) ** termMonths
  return (principal * (r * factor)) / (factor - 1)
}

/** Supported amortization systems for loan schedules. */
export type LoanAmortizationSystem = 'price' | 'sac'

/**
 * SAC payment for the current month.
 * Principal amortization is constant (principal / term), while interest is applied on current balance.
 */
export function sacMonthlyPayment(
  balance: number,
  principal: number,
  annualApr: number,
  termMonths: number,
): number {
  if (termMonths <= 0 || principal <= 0 || balance <= 0) return 0
  const principalChunk = principal / termMonths
  const monthlyRate = annualApr / 12
  const interest = balance * monthlyRate
  return Math.min(balance, principalChunk) + interest
}

export type AmortizationStepResult = {
  interestPortion: number
  principalPortion: number
  endingBalance: number
}

/** One month of interest + principal; balance floored at 0 */
export function amortizationStep(
  balance: number,
  annualApr: number,
  scheduledPayment: number,
): AmortizationStepResult {
  const monthlyRate = annualApr / 12
  const interestPortion = balance * monthlyRate
  const principalPortion = scheduledPayment - interestPortion
  const endingBalance = Math.max(0, balance - principalPortion)
  return { interestPortion, principalPortion, endingBalance }
}

/** Real value = nominal / (1 + inflation)^years */
export function realValueFromNominal(
  nominal: number,
  annualInflation: number,
  years: number,
): number {
  return nominal / (1 + annualInflation) ** years
}
