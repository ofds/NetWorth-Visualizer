import type { FinancialEvent } from '../events/types'
import type { AppLang, AppState } from '../store/useAppStore'
import {
  DEFAULT_GRAPH_SETTINGS,
  type GraphSettingsState,
  useAppStore,
} from '../store/useAppStore'

export const NWV_STORAGE_KEY = 'networth-visualizer-state-v1'

function isAppLang(v: unknown): v is AppLang {
  return v === 'en' || v === 'pt-BR'
}

type PersistedSlice = Pick<
  AppState,
  'events' | 'projectionYears' | 'currency' | 'currentAge' | 'graphSettings' | 'lang'
>

export function loadPersistedSlice(): Partial<PersistedSlice> | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(NWV_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Partial<PersistedSlice>
  } catch {
    return null
  }
}

export function savePersistedSlice(state: PersistedSlice): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(NWV_STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* quota / private mode */
  }
}

export function hydrateStoreFromStorage(): void {
  const p = loadPersistedSlice()
  if (!p) return
  const st = useAppStore.getState()
  if (Array.isArray(p.events)) st.setEvents(p.events as FinancialEvent[])
  if (p.projectionYears !== undefined) st.setProjectionYears(p.projectionYears)
  if (p.currency !== undefined) st.setCurrency(p.currency)
  if (p.currentAge !== undefined) st.setCurrentAge(p.currentAge)
  if (p.graphSettings) {
    const raw = { ...(p.graphSettings as Record<string, unknown>) }
    delete raw.showEventContributions
    delete raw.showContributionRibbonLegend
    st.patchGraphSettings({ ...DEFAULT_GRAPH_SETTINGS, ...(raw as Partial<GraphSettingsState>) })
  }
  if (isAppLang(p.lang)) st.setLang(p.lang)
}
