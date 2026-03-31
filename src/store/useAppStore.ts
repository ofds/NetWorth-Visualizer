import { arrayMove } from '@dnd-kit/sortable'
import { create } from 'zustand'
import i18n from '../i18n'
import { nextEventId } from '../events/defaults'
import { detectMilestones } from '../engine/milestones'
import { simulate, simulationHorizonMonths } from '../engine/simulate'
import type { Milestone, MonthSnapshot } from '../engine/types'
import type { MarkerDragPreview } from '../events/timelinePreviewEvents'
import type { EventType, FinancialEvent } from '../events/types'

function newIdForKind(kind: FinancialEvent['kind']): string {
  const prefix =
    kind === 'investment'
      ? 'inv'
      : kind === 'career'
        ? 'career'
        : kind === 'asset_liability'
          ? 'home'
          : kind === 'life'
            ? 'life'
            : kind === 'windfall'
              ? 'windfall'
              : 'macro'
  return nextEventId(prefix)
}

function uniqueEventId(existingIds: Set<string>, kind: FinancialEvent['kind']): string {
  let id = newIdForKind(kind)
  let guard = 0
  while (existingIds.has(id) && guard < 50) {
    id = nextEventId('evt')
    guard += 1
  }
  return id
}

export type GraphSettingsState = {
  showRealValues: boolean
  showLinearReference: boolean
  showMonteCarlo: boolean
  showAssetBreakdown: boolean
  /** Temporary overlay: recession-style macro (no change to saved events). */
  stressTestActive: boolean
  /** Life timeline strip above the chart (title bar can collapse the ruler body). */
  showLifeTimeline: boolean
  /** Pixel translate from default top-right anchor (graph tooltip). */
  graphTooltipOffset: { x: number; y: number }
  /** Tooltip panel size (px); persisted with offset. */
  graphTooltipWidth: number
  graphTooltipHeight: number
  /**
   * Visible X domain as inclusive simulation month indices [lo, hi], or null = full horizon.
   * Normalized against current series length in the graph (see `effectiveXDomain`).
   */
  zoomRange: readonly [number, number] | null
}

export type AppLang = 'en' | 'pt-BR'

export type AppState = {
  currentAge: number | undefined
  currency: string
  lang: AppLang
  projectionYears: number
  events: FinancialEvent[]
  selectedEventType: EventType | null
  editingEventId: string | null
  simulation: MonthSnapshot[]
  milestones: Milestone[]
  isDragging: boolean
  dragPreviewMonth: number | null
  /** Draft payload while dragging onto the graph (for live preview). */
  draggingDraft: FinancialEvent | null
  /** While repositioning a graph marker: live start month for timeline + layout. */
  markerDragPreview: MarkerDragPreview | null
  /**
   * When set by NetWorthGraph from `markerDragSnapshots`, invalid ring matches that sim (no second placement sim).
   * `null` = not driven from graph preview (use placement helpers).
   */
  markerDragPlacementInvalid: boolean | null
  /** Pinned tooltip month on the graph (reference for editor sliders / hypothetical placement). */
  graphPinnedMonth: number | null
  graphSettings: GraphSettingsState
}

function sortEvents(list: FinancialEvent[]): FinancialEvent[] {
  return [...list].sort((a, b) =>
    a.startMonth !== b.startMonth ? a.startMonth - b.startMonth : a.id.localeCompare(b.id),
  )
}

type AppActions = {
  setCurrentAge: (age: number | undefined) => void
  setCurrency: (currency: string) => void
  setLang: (lang: AppLang) => void
  setProjectionYears: (years: number) => void
  setEvents: (events: FinancialEvent[]) => void
  addEvent: (event: FinancialEvent) => void
  removeEvent: (id: string) => void
  replaceEvent: (event: FinancialEvent) => void
  reorderEvents: (fromIndex: number, toIndex: number) => void
  setSelectedEventType: (type: EventType | null) => void
  setEditingEventId: (id: string | null) => void
  setDraggingDraft: (draft: FinancialEvent | null) => void
  setDragging: (isDragging: boolean, previewMonth?: number | null) => void
  setMarkerDragPreview: (preview: MarkerDragPreview | null) => void
  setMarkerDragPlacementInvalid: (invalid: boolean | null) => void
  setGraphPinnedMonth: (month: number | null) => void
  patchGraphSettings: (patch: Partial<GraphSettingsState>) => void
  recomputeSimulation: () => void
}

/** Default graph toggles; merge with persisted `graphSettings` on hydrate. */
export const DEFAULT_GRAPH_SETTINGS: GraphSettingsState = {
  showRealValues: false,
  showLinearReference: false,
  showMonteCarlo: false,
  showAssetBreakdown: false,
  stressTestActive: false,
  showLifeTimeline: true,
  graphTooltipOffset: { x: 0, y: 0 },
  graphTooltipWidth: 260,
  graphTooltipHeight: 320,
  zoomRange: null,
}

const initialState: AppState = {
  currentAge: undefined,
  currency: 'USD',
  lang: 'en',
  projectionYears: 30,
  events: [],
  selectedEventType: null,
  editingEventId: null,
  simulation: [],
  milestones: [],
  isDragging: false,
  dragPreviewMonth: null,
  draggingDraft: null,
  markerDragPreview: null,
  markerDragPlacementInvalid: null,
  graphPinnedMonth: null,
  graphSettings: { ...DEFAULT_GRAPH_SETTINGS },
}

export type AppStore = AppState & AppActions

export const useAppStore = create<AppStore>((set, get) => ({
  ...initialState,
  setCurrentAge: (currentAge) => set({ currentAge }),
  setCurrency: (currency) => set({ currency }),
  setLang: (lang) => {
    void i18n.changeLanguage(lang)
    set({ lang })
  },
  setProjectionYears: (projectionYears) => set({ projectionYears }),
  setEvents: (events) => set({ events: sortEvents(events) }),
  addEvent: (event) =>
    set((s) => {
      const taken = new Set(s.events.map((e) => e.id))
      const id =
        event.id && !taken.has(event.id)
          ? event.id
          : uniqueEventId(taken, event.kind)
      return { events: sortEvents([...s.events, { ...event, id }]) }
    }),
  /** Removes a single timeline row (first match). Duplicate ids are avoided by addEvent. */
  removeEvent: (id) =>
    set((s) => {
      const idx = s.events.findIndex((e) => e.id === id)
      if (idx === -1) return {}
      return {
        events: [...s.events.slice(0, idx), ...s.events.slice(idx + 1)],
      }
    }),
  replaceEvent: (event) =>
    set((s) => ({
      events: sortEvents(s.events.map((e) => (e.id === event.id ? event : e))),
    })),
  reorderEvents: (fromIndex, toIndex) =>
    set((s) => {
      if (fromIndex === toIndex) return {}
      if (fromIndex < 0 || toIndex < 0) return {}
      if (fromIndex >= s.events.length || toIndex >= s.events.length) return {}
      return { events: arrayMove([...s.events], fromIndex, toIndex) }
    }),
  setSelectedEventType: (selectedEventType) => set({ selectedEventType }),
  setEditingEventId: (editingEventId) => set({ editingEventId }),
  setDraggingDraft: (draggingDraft) => set({ draggingDraft }),
  setDragging: (isDragging, previewMonth = null) =>
    set((s) =>
      isDragging
        ? {
            isDragging: true,
            dragPreviewMonth: previewMonth ?? s.dragPreviewMonth ?? 0,
          }
        : { isDragging: false, dragPreviewMonth: null, draggingDraft: null },
    ),
  setMarkerDragPreview: (markerDragPreview) =>
    set({
      markerDragPreview,
      markerDragPlacementInvalid: markerDragPreview === null ? null : get().markerDragPlacementInvalid,
    }),
  setMarkerDragPlacementInvalid: (markerDragPlacementInvalid) => set({ markerDragPlacementInvalid }),
  setGraphPinnedMonth: (graphPinnedMonth) => set({ graphPinnedMonth }),
  patchGraphSettings: (patch) =>
    set((s) => ({
      graphSettings: { ...s.graphSettings, ...patch },
    })),
  recomputeSimulation: () => {
    const { events, projectionYears } = get()
    if (events.length === 0) {
      set({ simulation: [], milestones: [] })
      return
    }
    const months = simulationHorizonMonths(projectionYears)
    const simulation = simulate(events, new Date(), months)
    const milestones = detectMilestones(simulation)
    set({ simulation, milestones })
  },
}))

export function getDefaultAppState(): AppState {
  return structuredClone(initialState)
}
