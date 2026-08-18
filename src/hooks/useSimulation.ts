import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'

/**
 * Keeps the store's `simulation`/`milestones` in sync with the financial inputs.
 *
 * Only `events` and `projectionYears` change simulation output. Presentation state
 * (real/nominal toggle, language, tooltips, zoom, …) must NOT re-run the engine —
 * previously toggling “Real $” or the UI language recomputed the full simulation
 * (and with it a full graph rebuild) even though the money numbers were identical.
 */
export function useSimulation() {
  const events = useAppStore((s) => s.events)
  const projectionYears = useAppStore((s) => s.projectionYears)

  useEffect(() => {
    useAppStore.getState().recomputeSimulation()
  }, [events, projectionYears])

  return { status: 'ready' as const }
}
