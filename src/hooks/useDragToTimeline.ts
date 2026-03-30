import { useCallback } from 'react'
import { clientXToMonthIndex } from '../utils/timelineCoords'

export {
  clamp,
  clientXToMonthIndex,
  clientXToMonthIndexInDomain,
} from '../utils/timelineCoords'

export function useDragToTimeline() {
  const toMonth = useCallback(
    (
      clientX: number,
      plotRect: DOMRect,
      totalMonths: number,
      marginLeft: number,
      marginRight: number,
    ) => clientXToMonthIndex(clientX, plotRect, totalMonths, marginLeft, marginRight),
    [],
  )
  return { toMonth }
}
