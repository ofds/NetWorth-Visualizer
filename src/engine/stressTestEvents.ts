import type { FinancialEvent, MacroEnvironmentEvent } from '../events/types'

/** Synthetic macro merged only for stress overlay — never persisted. */
export const STRESS_PREVIEW_MACRO_ID = '__nwv_stress_preview__'

/**
 * User macros are stripped and replaced by a single recession-style preview macro
 * so the overlay does not stack with saved macro rows.
 */
export function eventsWithStressMacro(events: FinancialEvent[]): FinancialEvent[] {
  const withoutMacro = events.filter((e) => e.kind !== 'macro')
  const stress: MacroEnvironmentEvent = {
    kind: 'macro',
    id: STRESS_PREVIEW_MACRO_ID,
    startMonth: 0,
    endMonth: null,
    name: 'Stress preview',
    annualInflationRate: 0.035,
    marketReturnModifierAnnual: -0.12,
    interestRateEnvironmentAnnual: 0.03,
    durationYears: 50,
    severity: 8,
  }
  return [...withoutMacro, stress]
}
