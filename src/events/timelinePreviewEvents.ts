import type { FinancialEvent } from './types'
import { mergeEventsForDragPlacement } from './mergeDragPlacement'
import { syncEndFromDuration } from './syncEventWindow'

export type MarkerDragPreview = { eventId: string; startMonth: number }

/**
 * Events as they should appear on the life timeline during drags (carousel → graph or marker slide).
 */
export function mergedEventsForTimelinePreview(
  events: FinancialEvent[],
  options: {
    isDragging: boolean
    draggingDraft: FinancialEvent | null
    dragPreviewMonth: number | null
    editingEventId: string | null
    markerDragPreview: MarkerDragPreview | null
  },
): FinancialEvent[] {
  const { markerDragPreview, isDragging, draggingDraft, dragPreviewMonth, editingEventId } = options
  if (markerDragPreview) {
    return events.map((e) =>
      e.id === markerDragPreview.eventId
        ? syncEndFromDuration({
            ...e,
            startMonth: markerDragPreview.startMonth,
          } as FinancialEvent)
        : e,
    )
  }
  if (isDragging && draggingDraft && dragPreviewMonth !== null) {
    return mergeEventsForDragPlacement(events, draggingDraft, dragPreviewMonth, editingEventId)
  }
  return events
}
