import type { MonthSnapshot } from './types'

export function pickYValue(s: MonthSnapshot, useReal: boolean): number {
  return useReal ? s.realNetWorth : s.netWorth
}

/** Nominal → display dollars (matches net-worth graph hover when "Real $" is on). */
export function snapshotInflationScale(s: MonthSnapshot, useReal: boolean): number {
  if (!useReal) return 1
  return s.netWorth !== 0 ? s.realNetWorth / s.netWorth : 1
}

export function scaledSavingsPool(s: MonthSnapshot, useReal: boolean): number {
  return s.savingsPool * snapshotInflationScale(s, useReal)
}
