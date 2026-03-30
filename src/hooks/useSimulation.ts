import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'

export function useSimulation() {
  const events = useAppStore((s) => s.events)
  const projectionYears = useAppStore((s) => s.projectionYears)
  const showReal = useAppStore((s) => s.graphSettings.showRealValues)
  const lang = useAppStore((s) => s.lang)
  const simulation = useAppStore((s) => s.simulation)

  useEffect(() => {
    useAppStore.getState().recomputeSimulation()
  }, [events, projectionYears, showReal, lang])

  return {
    snapshots: simulation,
    status: 'ready' as const,
  }
}
