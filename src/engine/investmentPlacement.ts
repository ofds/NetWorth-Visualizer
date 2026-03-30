import type { FinancialEvent } from '../events/types'
import type { MonthSnapshot } from './types'
import { mergeEventsForDragPlacement } from '../events/mergeDragPlacement'
import { simulate, simulationHorizonMonths } from './simulate'

/**
 * Sums per-month `investmentShortfallByEvent[eventId]` from a full simulation run.
 * Matches `investmentPlacementShortfallAtMonth` for the same merged timeline (see tests).
 */
export function totalInvestmentShortfallForEventFromSnapshots(
  snapshots: MonthSnapshot[],
  eventId: string,
): number {
  let total = 0
  for (const s of snapshots) {
    total += s.investmentShortfallByEvent[eventId] ?? 0
  }
  return total
}

/**
 * Total unfunded investment demand for `candidateId` over the projection horizon (sum of
 * initial-amount and recurring shortfalls each month after pool top-up and pool interest,
 * in engine order with other investments). `dropMonth` only selects where the candidate is
 * merged onto the timeline; feasibility requires zero shortfall in every simulated month.
 */
export function investmentPlacementShortfallAtMonth(
  events: FinancialEvent[],
  draft: FinancialEvent,
  dropMonth: number,
  editingEventId: string | null,
  projectionYears: number,
): number {
  if (draft.kind !== 'investment') return 0
  const months = simulationHorizonMonths(projectionYears)
  if (months <= 0) return 0
  const m = Math.min(Math.max(0, dropMonth), months - 1)
  const merged = mergeEventsForDragPlacement(events, draft, m, editingEventId)
  const candidateId = editingEventId ?? draft.id
  let total = 0
  simulate(merged, new Date(), months, {
    onInvestmentShortfall: (_mo, id, amt) => {
      if (id === candidateId) total += amt
    },
  })
  return total
}

export function investmentCanPlaceAtMonth(
  events: FinancialEvent[],
  draft: FinancialEvent,
  dropMonth: number,
  editingEventId: string | null,
  projectionYears: number,
): boolean {
  return investmentPlacementShortfallAtMonth(
    events,
    draft,
    dropMonth,
    editingEventId,
    projectionYears,
  ) === 0
}
