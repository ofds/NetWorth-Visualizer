import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { useAppStore } from '../../store/useAppStore'

export const NW_GRAPH_DROP_ID = 'nw-graph-drop'

type Props = {
  children: ReactNode
  className?: string
  /** True while dragging an investment or asset that cannot be placed at the hover month (e.g. insufficient pool/reserve). */
  dropInvalid?: boolean
  /** True while dragging a graph marker to reposition (not carousel dnd); enables invalid ring without store isDragging. */
  graphMarkerRepositioning?: boolean
  /** A simulation month is pinned (tooltip focus) — use amber ring accents instead of teal (matches pin chrome). */
  graphPinned?: boolean
}

export function DropZone({
  children,
  className = '',
  dropInvalid = false,
  graphMarkerRepositioning = false,
  graphPinned = false,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: NW_GRAPH_DROP_ID })
  const isDragging = useAppStore((s) => s.isDragging)
  const activeTarget = isDragging || isOver || graphMarkerRepositioning
  const placementDrag = isDragging || graphMarkerRepositioning
  /**
   * dnd-kit `isOver` is only true while a *dnd-kit* draggable is active. Graph marker moves use
   * pointer capture, so `isOver` stays false — blocked ring must not depend on `isOver` for that case.
   */
  const ringBlocked =
    dropInvalid &&
    (isDragging ? isOver : graphMarkerRepositioning)
  const ringOk = !dropInvalid && (isOver || (graphMarkerRepositioning && !isDragging))

  const okRing = graphPinned
    ? 'ring-2 ring-amber-400/60 ring-offset-2 ring-offset-slate-950'
    : 'ring-2 ring-teal-400/70 ring-offset-2 ring-offset-slate-950'
  const dragIdleRing = graphPinned
    ? 'bg-amber-500/[0.05] ring-2 ring-amber-500/40 ring-offset-2 ring-offset-slate-950'
    : 'bg-teal-500/[0.04] ring-2 ring-teal-500/35 ring-offset-2 ring-offset-slate-950'
  const idlePinnedRing =
    'ring-2 ring-amber-400/35 ring-offset-2 ring-offset-slate-950 bg-amber-500/[0.03]'

  return (
    <div
      ref={setNodeRef}
      data-testid="nw-graph-drop-zone"
      className={`transition-[box-shadow,background-color] duration-200 ${className} ${
        ringBlocked
          ? 'bg-rose-500/[0.06] ring-2 ring-rose-400/70 ring-offset-2 ring-offset-slate-950'
          : ringOk
            ? okRing
            : placementDrag
              ? dragIdleRing
              : graphPinned
                ? idlePinnedRing
                : ''
      } ${activeTarget || graphPinned ? 'rounded-xl' : ''}`}
    >
      {children}
    </div>
  )
}
