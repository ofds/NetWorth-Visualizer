import { describe, expect, it } from 'vitest'
import {
  amortizationStep,
  futureValueAnnuity,
  futureValueCompound,
  loanMonthlyPayment,
  realValueFromNominal,
  sacMonthlyPayment,
} from './formulas'

describe('futureValueCompound', () => {
  it('returns PV when years or rate yields zero periods effect', () => {
    expect(futureValueCompound(1000, 0.1, 0)).toBe(1000)
  })

  it('matches monthly compounding for one year at 10% APR', () => {
    const fv = futureValueCompound(1000, 0.1, 1, 12)
    expect(fv).toBeCloseTo(1104.713, 2)
  })

  it('handles zero present value', () => {
    expect(futureValueCompound(0, 0.08, 10)).toBe(0)
  })
})

describe('futureValueAnnuity', () => {
  it('is linear when annual rate is 0', () => {
    expect(futureValueAnnuity(100, 0, 1, 12)).toBe(1200)
  })

  it('accumulates end-of-month payments with interest', () => {
    const fv = futureValueAnnuity(100, 0.1, 1, 12)
    expect(fv).toBeCloseTo(1256.56, 2)
  })

  it('returns 0 when no periods', () => {
    expect(futureValueAnnuity(50, 0.05, 0)).toBe(0)
  })
})

describe('loanMonthlyPayment', () => {
  it('returns 0 for non-positive term', () => {
    expect(loanMonthlyPayment(100_000, 0.06, 0)).toBe(0)
  })

  it('returns 0 for non-positive principal', () => {
    expect(loanMonthlyPayment(0, 0.06, 360)).toBe(0)
  })

  it('matches standard 30y fixed example', () => {
    const pmt = loanMonthlyPayment(300_000, 0.065, 360)
    expect(pmt).toBeCloseTo(1896.2, 1)
  })

  it('splits evenly when APR is 0', () => {
    expect(loanMonthlyPayment(1200, 0, 12)).toBe(100)
  })
})

describe('sacMonthlyPayment', () => {
  it('returns 0 for invalid inputs', () => {
    expect(sacMonthlyPayment(0, 100_000, 0.06, 120)).toBe(0)
    expect(sacMonthlyPayment(100_000, 0, 0.06, 120)).toBe(0)
    expect(sacMonthlyPayment(100_000, 100_000, 0.06, 0)).toBe(0)
  })

  it('decreases as balance falls', () => {
    const p0 = sacMonthlyPayment(100_000, 100_000, 0.12, 120)
    const p1 = sacMonthlyPayment(99_000, 100_000, 0.12, 120)
    expect(p1).toBeLessThan(p0)
  })
})

describe('amortizationStep', () => {
  it('applies interest to full balance then reduces principal', () => {
    const { interestPortion, principalPortion, endingBalance } =
      amortizationStep(100_000, 0.06, 600)
    expect(interestPortion).toBeCloseTo(500, 2)
    expect(principalPortion).toBeCloseTo(100, 2)
    expect(endingBalance).toBeCloseTo(99_900, 2)
  })

  it('floors balance at 0 when payment exceeds balance + interest', () => {
    const { endingBalance } = amortizationStep(100, 0, 500)
    expect(endingBalance).toBe(0)
  })
})

describe('realValueFromNominal', () => {
  it('deflates by compound inflation', () => {
    expect(realValueFromNominal(1100, 0.1, 1)).toBeCloseTo(1000, 5)
  })

  it('returns nominal when inflation is 0', () => {
    expect(realValueFromNominal(5000, 0, 10)).toBe(5000)
  })
})
