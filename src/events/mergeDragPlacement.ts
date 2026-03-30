import type { FinancialEvent } from './types'
import { syncEndFromDuration } from './syncEventWindow'

/** Merge editor draft into the timeline as if dropped on `dropMonth` (new or replace while editing). */
export function mergeEventsForDragPlacement(
  eventList: FinancialEvent[],
  draft: FinancialEvent,
  dropMonth: number,
  editingId: string | null,
): FinancialEvent[] {
  const placed = syncEndFromDuration({ ...draft, startMonth: dropMonth } as FinancialEvent)
  if (editingId) {
    return eventList.map((e) => (e.id === editingId ? { ...placed, id: editingId } : e))
  }
  const rest = eventList.filter((e) => e.id !== placed.id)
  return [...rest, placed]
}
