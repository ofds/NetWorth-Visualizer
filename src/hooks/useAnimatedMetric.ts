import { useLayoutEffect, useMemo, useRef, useState } from 'react'

/**
 * Eases displayed numbers toward `target`. Uses a ref for the target so each frame chases the
 * latest value (no stale closure when `target` updates every frame — avoids runaway / stuck
 * interpolation during rapid hover or marker drag).
 */
export function useAnimatedMetric(
  target: number,
  options?: { durationMs?: number; enabled?: boolean },
): number {
  const durationMs = options?.durationMs ?? 280
  const enabled = options?.enabled ?? true

  const safeTarget = Number.isFinite(target) ? target : 0
  const targetRef = useRef(safeTarget)
  targetRef.current = safeTarget

  const [display, setDisplay] = useState(safeTarget)
  const displayRef = useRef(safeTarget)
  const rafRef = useRef<number | null>(null)
  const wasEnabledRef = useRef(false)

  /** Per-frame blend so ~durationMs settles at 60fps without overshoot. */
  const smooth = useMemo(() => {
    const frames = Math.max(5, Math.round(durationMs / 17))
    return 1 - Math.pow(1e-6, 1 / frames)
  }, [durationMs])

  useLayoutEffect(() => {
    if (!enabled) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      wasEnabledRef.current = false
      const t = targetRef.current
      displayRef.current = t
      setDisplay(t)
      return
    }
    if (!wasEnabledRef.current) {
      wasEnabledRef.current = true
      const t = targetRef.current
      displayRef.current = t
      setDisplay(t)
      return
    }

    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    const tick = (): void => {
      const tgt = targetRef.current
      let cur = displayRef.current
      if (!Number.isFinite(cur)) cur = tgt
      const err = tgt - cur
      if (Math.abs(err) < 0.5) {
        if (cur !== tgt) {
          displayRef.current = tgt
          setDisplay(tgt)
        }
        rafRef.current = null
        return
      }
      const next = cur + err * smooth
      displayRef.current = next
      setDisplay(next)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [target, enabled, smooth])

  return display
}
