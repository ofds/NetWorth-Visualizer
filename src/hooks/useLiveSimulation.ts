import { useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'
import { simulate, simulationHorizonMonths } from '../engine/simulate'
import type { MonthSnapshot } from '../engine/types'
import type { FinancialEvent } from '../events/types'
import { editorReferenceStartMonth } from '../events/editorReferenceMonth'
import { syncEndFromDuration } from '../events/syncEventWindow'
import { useDragPreviewSim } from './useDragPreviewSim'

/** Timeline + current editor draft, for live simulation (includes not-yet-placed drafts). */
export function mergedEventsForLiveSim(
  draft: FinancialEvent,
  events: FinancialEvent[],
  editingEventId: string | null,
): FinancialEvent[] {
  if (editingEventId !== null) {
    return events.map((x) =>
      x.id === editingEventId ? ({ ...draft, id: editingEventId } as FinancialEvent) : x,
    )
  }
  if (events.some((x) => x.id === draft.id)) return events
  return [...events, draft]
}

export type LiveSim = {
  snapshots: MonthSnapshot[]
  /** The exact merged timeline `snapshots` was simulated from (for pool-cap helpers). */
  mergedEvents: FinancialEvent[]
  /** Reference month the draft is hypothetically placed at. */
  referenceMonth: number
}

/**
 * Single source of truth for the event form's live projection:
 *
 *  - while dragging this draft: reuses the store's shared drag-preview simulation
 *    (zero extra simulations per pointer move);
 *  - otherwise: one simulation of the draft at its reference month (pinned month,
 *    drag month, or its own start).
 *
 * Previously each of the three consumers (horizon preview, investment pool callout,
 * pool-cap rows) ran its own full `simulate()` on every render — e.g. 3 redundant
 * simulations per keystroke.
 */
export function useLiveSimulation(draft: FinancialEvent | null): LiveSim | null {
  const events = useAppStore((s) => s.events)
  const editingEventId = useAppStore((s) => s.editingEventId)
  const projectionYears = useAppStore((s) => s.projectionYears)
  const graphPinnedMonth = useAppStore((s) => s.graphPinnedMonth)
  const isDragging = useAppStore((s) => s.isDragging)
  const dragPreviewMonth = useAppStore((s) => s.dragPreviewMonth)
  const draggingDraft = useAppStore((s) => s.draggingDraft)
  const simulation = useAppStore((s) => s.simulation)
  const shared = useDragPreviewSim(draft)

  const months = useMemo(() => simulationHorizonMonths(projectionYears), [projectionYears])

  return useMemo(() => {
    if (!draft) return null
    const simulationLength = Math.max(1, simulation.length, months)
    const referenceMonth = editorReferenceStartMonth({
      draft,
      graphPinnedMonth,
      isDragging,
      dragPreviewMonth,
      draggingDraft,
      simulationLength,
    })

    if (shared.substitute && shared.snapshots && shared.mergedEvents) {
      return {
        snapshots: shared.snapshots,
        mergedEvents: shared.mergedEvents,
        referenceMonth,
      }
    }

    const draftAtRef = syncEndFromDuration({ ...draft, startMonth: referenceMonth } as FinancialEvent)
    const merged = mergedEventsForLiveSim(draftAtRef, events, editingEventId)
    return {
      snapshots: simulate(merged, new Date(), months),
      mergedEvents: merged,
      referenceMonth,
    }
  }, [
    draft,
    events,
    editingEventId,
    months,
    graphPinnedMonth,
    isDragging,
    dragPreviewMonth,
    draggingDraft,
    simulation.length,
    shared,
  ])
}
