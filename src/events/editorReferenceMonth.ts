import type { FinancialEvent } from './types'

/**
 * Month index used when editing/placing an event: drag preview wins, else pinned graph month,
 * else the draft's timeline `startMonth`. Clamped to `0..simulationLength-1`.
 */
export function editorReferenceStartMonth(params: {
  draft: FinancialEvent
  graphPinnedMonth: number | null
  isDragging: boolean
  dragPreviewMonth: number | null
  draggingDraft: FinancialEvent | null
  simulationLength: number
}): number {
  const { draft, graphPinnedMonth, isDragging, dragPreviewMonth, draggingDraft, simulationLength } =
    params
  const hi = Math.max(0, simulationLength - 1)
  if (
    isDragging &&
    dragPreviewMonth !== null &&
    draggingDraft !== null &&
    draft.id === draggingDraft.id
  ) {
    return Math.min(Math.max(0, dragPreviewMonth), hi)
  }
  if (graphPinnedMonth !== null) {
    return Math.min(Math.max(0, graphPinnedMonth), hi)
  }
  return Math.min(Math.max(0, draft.startMonth), hi)
}
