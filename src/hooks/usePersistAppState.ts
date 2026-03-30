import { useEffect, useRef } from 'react'
import { savePersistedSlice } from '../lib/persistStorage'
import { useAppStore } from '../store/useAppStore'

/** Debounced localStorage persistence for scenario slice (Stage 9). */
export function usePersistAppState() {
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const events = useAppStore((s) => s.events)
  const projectionYears = useAppStore((s) => s.projectionYears)
  const currency = useAppStore((s) => s.currency)
  const currentAge = useAppStore((s) => s.currentAge)
  const graphSettings = useAppStore((s) => s.graphSettings)
  const lang = useAppStore((s) => s.lang)

  useEffect(() => {
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(() => {
      savePersistedSlice({
        events,
        projectionYears,
        currency,
        currentAge,
        graphSettings,
        lang,
      })
    }, 250)
    return () => {
      if (t.current) clearTimeout(t.current)
    }
  }, [events, projectionYears, currency, currentAge, graphSettings, lang])
}
