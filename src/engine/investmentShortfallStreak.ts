import type { FinancialEvent } from '../events/types'
import { isEventActive } from './simulate'
import type { MonthSnapshot } from './types'

/**
 * Investment events that have ≥ `minStreak` consecutive months of pool shortfall
 * while the investment is active (uses per-event `investmentShortfallByEvent`).
 */
export function investmentShortfallStreakIds(
  snapshots: MonthSnapshot[],
  events: FinancialEvent[],
  minStreak = 3,
): Set<string> {
  const investments = events.filter(
    (e): e is Extract<FinancialEvent, { kind: 'investment' }> => e.kind === 'investment',
  )
  if (investments.length === 0 || snapshots.length === 0) return new Set()

  const streak: Record<string, number> = {}
  const out = new Set<string>()

  for (let m = 0; m < snapshots.length; m++) {
    const snap = snapshots[m]!
    for (const ev of investments) {
      if (!isEventActive(ev, m)) {
        streak[ev.id] = 0
        continue
      }
      const sh = snap.investmentShortfallByEvent[ev.id] ?? 0
      if (sh > 1e-12) {
        const next = (streak[ev.id] ?? 0) + 1
        streak[ev.id] = next
        if (next >= minStreak) out.add(ev.id)
      } else {
        streak[ev.id] = 0
      }
    }
  }

  return out
}
