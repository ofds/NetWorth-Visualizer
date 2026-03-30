import type { FinancialEvent } from '../events/types'
import { mergeEventsForDragPlacement } from '../events/mergeDragPlacement'
import type { MonthSnapshot } from './types'
import { simulate, simulationHorizonMonths } from './simulate'

/** Sums per-month `assetDownPaymentShortfallByEvent[eventId]` from a full simulation run. */
export function totalAssetDownPaymentShortfallForEventFromSnapshots(
  snapshots: MonthSnapshot[],
  eventId: string,
): number {
  let total = 0
  for (const s of snapshots) {
    total += s.assetDownPaymentShortfallByEvent[eventId] ?? 0
  }
  return total
}

/**
 * Total down-payment shortfall for candidate asset placement month.
 * A shortfall occurs when downPayment exceeds non-negative reserve at activation.
 */
export function assetPlacementShortfallAtMonth(
  events: FinancialEvent[],
  draft: FinancialEvent,
  dropMonth: number,
  editingEventId: string | null,
  projectionYears: number,
): number {
  if (draft.kind !== 'asset_liability' || draft.mode !== 'asset') return 0
  const months = simulationHorizonMonths(projectionYears)
  if (months <= 0) return 0
  const m = Math.min(Math.max(0, dropMonth), months - 1)
  const merged = mergeEventsForDragPlacement(events, draft, m, editingEventId)
  const candidateId = editingEventId ?? draft.id
  let total = 0
  simulate(merged, new Date(), months, {
    onAssetDownPaymentShortfall: (_mo, id, amt) => {
      if (id === candidateId) total += amt
    },
  })
  return total
}

export function assetCanPlaceAtMonth(
  events: FinancialEvent[],
  draft: FinancialEvent,
  dropMonth: number,
  editingEventId: string | null,
  projectionYears: number,
): boolean {
  return (
    assetPlacementShortfallAtMonth(
      events,
      draft,
      dropMonth,
      editingEventId,
      projectionYears,
    ) === 0
  )
}

