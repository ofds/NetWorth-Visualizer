import { useAppStore } from '../store/useAppStore'
import type { MonthSnapshot } from '../engine/types'
import type { FinancialEvent } from '../events/types'

/**
 * Reuses the store's drag-preview simulation (computed once per pointer move in
 * `setDragging`) inside the event form, which previously ran its own full
 * `simulate()` per drag move (Horizon preview, investment pool callout, pool-cap
 * calculation and asset shortfall — up to 4 redundant simulations per move).
 *
 * Eligible only when the dragged draft is the form's draft AND the store's merged
 * timeline is identical to what the form would compute (editing an existing event,
 * or a fresh draft not yet on the timeline). Returns `substitute: false` otherwise
 * so callers fall back to their own simulation.
 */
export function useDragPreviewSim(draft: FinancialEvent | null): {
  substitute: boolean
  snapshots: MonthSnapshot[] | null
  mergedEvents: FinancialEvent[] | null
} {
  const isDragging = useAppStore((s) => s.isDragging)
  const draggingDraft = useAppStore((s) => s.draggingDraft)
  const dragPreviewSnapshots = useAppStore((s) => s.dragPreviewSnapshots)
  const dragPreviewMergedEvents = useAppStore((s) => s.dragPreviewMergedEvents)
  const editingEventId = useAppStore((s) => s.editingEventId)
  const events = useAppStore((s) => s.events)

  const eligible =
    isDragging &&
    draggingDraft !== null &&
    draft !== null &&
    draggingDraft.id === draft.id &&
    (editingEventId !== null || !events.some((e) => e.id === draft.id)) &&
    dragPreviewSnapshots !== null &&
    dragPreviewSnapshots.length > 0 &&
    dragPreviewMergedEvents !== null

  return {
    substitute: eligible,
    snapshots: eligible ? dragPreviewSnapshots : null,
    mergedEvents: eligible ? dragPreviewMergedEvents : null,
  }
}
