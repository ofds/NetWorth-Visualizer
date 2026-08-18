/**
 * Deterministic benchmark scenario generators.
 *
 * All scenarios are pure functions of a seed so before/after runs are comparable.
 * The generator mixes event kinds to exercise the engine's hot paths:
 * careers (chaining), investments (recurring + lump), assets (down payment +
 * amortization, both PRICE and SAC), liabilities, life events, macros and windfalls.
 */
import type { FinancialEvent } from '../src/events/types'

export type Scenario = {
  name: string
  events: FinancialEvent[]
  months: number
}

/** Tiny deterministic PRNG (mulberry32) so scenarios are reproducible across runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let uid = 0
function nextId(prefix: string): string {
  uid += 1
  return `${prefix}-${uid}`
}

export function buildScenario(
  name: string,
  eventCount: number,
  months: number,
  seed = 42,
): Scenario {
  const rnd = mulberry32(seed)
  const events: FinancialEvent[] = []

  // One baseline career so the pool builds.
  events.push({
    kind: 'career',
    id: nextId('career'),
    startMonth: 0,
    endMonth: null,
    name: 'Baseline job',
    monthlyGrossIncome: 8000,
    savingsRate: 0.2,
    effectiveTaxRate: 0.22,
    durationMonths: null,
  })

  const horizon = months
  for (let i = 0; i < eventCount; i++) {
    const kindRoll = rnd()
    const start = Math.floor(rnd() * horizon * 0.85)
    const duration = 12 * (2 + Math.floor(rnd() * 20))

    if (kindRoll < 0.2) {
      // Career (chains naturally via start order).
      events.push({
        kind: 'career',
        id: nextId('career'),
        startMonth: start,
        endMonth: null,
        name: `Job ${i}`,
        monthlyGrossIncome: 5000 + Math.floor(rnd() * 25000),
        savingsRate: 0.1 + rnd() * 0.4,
        effectiveTaxRate: 0.15 + rnd() * 0.2,
        durationMonths: null,
      })
    } else if (kindRoll < 0.45) {
      // Investment (recurring or lump).
      const recurring = rnd() < 0.7
      events.push({
        kind: 'investment',
        id: nextId('inv'),
        startMonth: start,
        endMonth: start + duration,
        name: `Investment ${i}`,
        contributionKind: recurring ? 'recurring' : 'lump_sum',
        initialAmount: recurring ? 0 : Math.floor(rnd() * 80000),
        monthlyContribution: recurring ? 100 + Math.floor(rnd() * 2000) : 0,
        expectedAnnualReturn: 0.04 + rnd() * 0.1,
        assetClass: 'stocks',
        showVolatilityCone: false,
        durationYears: duration / 12,
      })
    } else if (kindRoll < 0.65) {
      // Asset or liability.
      const isAsset = rnd() < 0.6
      const principal = 50_000 + Math.floor(rnd() * 450_000)
      events.push({
        kind: 'asset_liability',
        id: nextId(isAsset ? 'home' : 'loan'),
        startMonth: start,
        endMonth: null,
        name: isAsset ? `Asset ${i}` : `Liability ${i}`,
        mode: isAsset ? 'asset' : 'liability',
        principal,
        downPayment: isAsset ? Math.floor(principal * 0.2) : 0,
        amortizationSystem: rnd() < 0.5 ? 'price' : 'sac',
        installmentSource: rnd() < 0.15 ? 'reserve' : 'expenses',
        annualApr: 0.03 + rnd() * 0.09,
        termYears: 5 + Math.floor(rnd() * 25),
        monthlyPaymentOverride: null,
        annualValueChangeRate: isAsset ? -0.05 + rnd() * 0.12 : 0,
      })
    } else if (kindRoll < 0.8) {
      // Life event.
      events.push({
        kind: 'life',
        id: nextId('life'),
        startMonth: start,
        endMonth: start + duration,
        name: `Life ${i}`,
        lifeKind: 'custom',
        monthlyExpenseChange: (rnd() - 0.5) * 2000,
        oneTimeCost: rnd() < 0.3 ? Math.floor(rnd() * 30000) : 0,
        durationYears: duration / 12,
        incomeImpactPercent: rnd() < 0.2 ? Math.floor(rnd() * 60) : 100,
      })
    } else if (kindRoll < 0.92) {
      // Macro.
      events.push({
        kind: 'macro',
        id: nextId('macro'),
        startMonth: start,
        endMonth: start + duration,
        name: `Macro ${i}`,
        annualInflationRate: 0 + rnd() * 0.08,
        marketReturnModifierAnnual: -0.2 + rnd() * 0.35,
        interestRateEnvironmentAnnual: rnd() * 0.07,
        durationYears: duration / 12,
        severity: 1 + Math.floor(rnd() * 10),
      })
    } else {
      // Windfall.
      events.push({
        kind: 'windfall',
        id: nextId('windfall'),
        startMonth: start,
        endMonth: start,
        name: `Windfall ${i}`,
        amount: Math.floor(rnd() * 200_000),
      })
    }
  }

  return { name, events, months }
}

export const BENCH_SCENARIOS: Scenario[] = [
  buildScenario('small', 5, 120, 7),
  buildScenario('medium', 25, 360, 7),
  buildScenario('large', 100, 600, 7),
  buildScenario('stress', 300, 600, 7),
]
