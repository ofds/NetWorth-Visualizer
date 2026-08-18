import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createDefaultEventForType, nextEventId } from '../../events/defaults'
import { mergedEventsForTimelinePreview } from '../../events/timelinePreviewEvents'
import { syncEndFromDuration } from '../../events/syncEventWindow'
import type { EventType, FinancialEvent } from '../../events/types'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { usePersistAppState } from '../../hooks/usePersistAppState'
import { useResizeObserverRect } from '../../hooks/useGraphDimensions'
import { useSimulation } from '../../hooks/useSimulation'
import { assetCanPlaceAtMonth } from '../../engine/assetPlacement'
import { investmentCanPlaceAtMonth } from '../../engine/investmentPlacement'
import { totalAssetDownPaymentShortfallForEventFromSnapshots } from '../../engine/assetPlacement'
import { totalInvestmentShortfallForEventFromSnapshots } from '../../engine/investmentPlacement'
import { simulationHorizonMonths } from '../../engine/simulate'
import { clientXToMonthIndexInDomain } from '../../utils/timelineCoords'
import { useAppStore } from '../../store/useAppStore'
import { effectiveXDomain } from '../Graph/graphXDomain'
import { computeLifeTimelineRulerHeight, LifeTimelineRuler } from '../Graph/LifeTimelineRuler'
import { GRAPH_MARGIN } from '../Graph/GraphLayers'
import { EventCarousel } from '../Carousel/EventCarousel'
import { DraggableIcon } from '../EventForm/DraggableIcon'
import { EventForm } from '../EventForm/EventForm'
import { DropZone, NW_GRAPH_DROP_ID } from '../Graph/DropZone'
import { NetWorthGraph } from '../Graph/NetWorthGraph'
import { LanguageIconButton } from '../shared/LanguageIconButton'
import { HeroKpiStrip } from './HeroKpiStrip'

const CAROUSEL_HINT_KEY = 'nw_carousel_hint_v1'

export function AppShell() {
  const { t } = useTranslation()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const graphPlotRef = useRef<HTMLDivElement>(null)
  const carouselDeleteZoneRef = useRef<HTMLDivElement>(null)
  const { width, height } = useResizeObserverRect(graphPlotRef)

  const narrow = useMediaQuery('(max-width: 768px)')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState<FinancialEvent | null>(null)
  const [carouselHint, setCarouselHint] = useState(
    () => typeof localStorage !== 'undefined' && !localStorage.getItem(CAROUSEL_HINT_KEY),
  )
  const [dndRejection, setDndRejection] = useState<string | null>(null)
  const [carouselDeleteHover, setCarouselDeleteHover] = useState(false)
  const [graphMarkerGrabActive, setGraphMarkerGrabActive] = useState(false)

  const dismissCarouselHint = useCallback(() => {
    if (carouselHint) {
      localStorage.setItem(CAROUSEL_HINT_KEY, '1')
      setCarouselHint(false)
    }
  }, [carouselHint])

  const selectedEventType = useAppStore((s) => s.selectedEventType)
  const setSelectedEventType = useAppStore((s) => s.setSelectedEventType)
  const setEditingEventId = useAppStore((s) => s.setEditingEventId)
  const setGraphPinnedMonth = useAppStore((s) => s.setGraphPinnedMonth)
  const events = useAppStore((s) => s.events)
  const addEvent = useAppStore((s) => s.addEvent)
  const removeEvent = useAppStore((s) => s.removeEvent)
  const replaceEvent = useAppStore((s) => s.replaceEvent)
  const reorderEvents = useAppStore((s) => s.reorderEvents)
  const projectionYears = useAppStore((s) => s.projectionYears)
  const setProjectionYears = useAppStore((s) => s.setProjectionYears)
  const patchGraphSettings = useAppStore((s) => s.patchGraphSettings)
  const graphSettings = useAppStore((s) => s.graphSettings)
  const isDragging = useAppStore((s) => s.isDragging)
  const draggingDraft = useAppStore((s) => s.draggingDraft)
  const dragPreviewMonth = useAppStore((s) => s.dragPreviewMonth)
  const dragPreviewSnapshots = useAppStore((s) => s.dragPreviewSnapshots)
  const editingEventId = useAppStore((s) => s.editingEventId)
  const markerDragPreview = useAppStore((s) => s.markerDragPreview)
  const markerDragPlacementInvalid = useAppStore((s) => s.markerDragPlacementInvalid)
  const setDragging = useAppStore((s) => s.setDragging)
  const setDraggingDraft = useAppStore((s) => s.setDraggingDraft)
  const currentAge = useAppStore((s) => s.currentAge)

  const mergedTimelineEvents = useMemo(
    () =>
      mergedEventsForTimelinePreview(events, {
        isDragging,
        draggingDraft,
        dragPreviewMonth,
        editingEventId,
        markerDragPreview,
      }),
    [
      events,
      isDragging,
      draggingDraft,
      dragPreviewMonth,
      editingEventId,
      markerDragPreview,
    ],
  )

  /** Pixels for the clickable “Life timeline” heading above the ruler SVG. */
  const LIFE_TIMELINE_TITLE_BAR_H = 28

  const lifeTimelineBodyHeight = useMemo(() => {
    if (events.length === 0 || !graphSettings.showLifeTimeline) return 0
    return computeLifeTimelineRulerHeight(mergedTimelineEvents, projectionYears, {
      titleInSvg: false,
    })
  }, [events.length, mergedTimelineEvents, projectionYears, graphSettings.showLifeTimeline])

  const lifeTimelineBlockHeight = useMemo(() => {
    if (events.length === 0) return 0
    return LIFE_TIMELINE_TITLE_BAR_H + lifeTimelineBodyHeight
  }, [events.length, lifeTimelineBodyHeight])

  /** True while dragging an investment or asset whose placement is invalid at the hover month (pool/reserve).
   *  Derived from the shared drag-preview simulation (exactly the shortfall the placement helpers compute)
   *  instead of running a separate full simulation per pointer move. */
  const graphDropInvalid = useMemo(() => {
    if (!isDragging || !draggingDraft || dragPreviewMonth === null) return false
    if (!dragPreviewSnapshots || dragPreviewSnapshots.length === 0) return false
    const candidateId = editingEventId ?? draggingDraft.id
    if (draggingDraft.kind === 'investment') {
      return totalInvestmentShortfallForEventFromSnapshots(dragPreviewSnapshots, candidateId) !== 0
    }
    if (draggingDraft.kind === 'asset_liability' && draggingDraft.mode === 'asset') {
      return (
        totalAssetDownPaymentShortfallForEventFromSnapshots(dragPreviewSnapshots, candidateId) !==
        0
      )
    }
    return false
  }, [isDragging, draggingDraft, dragPreviewMonth, dragPreviewSnapshots, editingEventId])

  /** Marker drag on graph: invalid if investment/asset cannot be placed at preview month. */
  const markerRepositionInvalid = useMemo(() => {
    if (!markerDragPreview) return false
    const ev = events.find((e) => e.id === markerDragPreview.eventId)
    if (!ev) return false
    const m = markerDragPreview.startMonth
    const editId =
      editingEventId === markerDragPreview.eventId ? markerDragPreview.eventId : null
    if (ev.kind === 'investment') {
      if (markerDragPlacementInvalid !== null) return markerDragPlacementInvalid
      return !investmentCanPlaceAtMonth(events, ev, m, editId, projectionYears)
    }
    if (ev.kind === 'asset_liability' && ev.mode === 'asset') {
      if (markerDragPlacementInvalid !== null) return markerDragPlacementInvalid
      return !assetCanPlaceAtMonth(events, ev, m, editId, projectionYears)
    }
    return false
  }, [
    markerDragPreview,
    events,
    editingEventId,
    projectionYears,
    markerDragPlacementInvalid,
  ])

  const placementPreviewInvalid = graphDropInvalid || markerRepositionInvalid

  useSimulation()
  usePersistAppState()

  useEffect(() => {
    if (!dndRejection) return
    const id = window.setTimeout(() => setDndRejection(null), 6000)
    return () => window.clearTimeout(id)
  }, [dndRejection])

  useEffect(() => {
    if (!isDragging) return
    const el = graphPlotRef.current
    if (!el) return
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      const st = useAppStore.getState()
      const months = simulationHorizonMonths(st.projectionYears)
      const xMaxIdx = Math.max(0, months - 1)
      const dom = effectiveXDomain(xMaxIdx, st.graphSettings.zoomRange)
      const m = clientXToMonthIndexInDomain(
        e.clientX,
        rect,
        months,
        GRAPH_MARGIN.left,
        GRAPH_MARGIN.right,
        dom,
      )
      setDragging(true, m)
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [isDragging, projectionYears, setDragging])

  const handleDragStart = useCallback(
    (e: DragStartEvent) => {
      const activeId = String(e.active.id)
      if (!activeId.startsWith('nw-drag-')) return
      const d = e.active.data.current as { draft?: FinancialEvent } | undefined
      setDraggingDraft(d?.draft ?? null)
      setDragging(true, d?.draft?.startMonth ?? 0)
    },
    [setDragging, setDraggingDraft],
  )

  const commitDraftAtMonth = useCallback(
    (dataDraft: FinancialEvent, rawMonth: number) => {
      const st = useAppStore.getState()
      const horizon = simulationHorizonMonths(st.projectionYears)
      const m = Math.min(Math.max(0, rawMonth), Math.max(0, horizon - 1))
      if (
        dataDraft.kind === 'investment' &&
        !investmentCanPlaceAtMonth(
          st.events,
          dataDraft,
          m,
          st.editingEventId,
          st.projectionYears,
        )
      ) {
        setDndRejection(t('dnd.investmentInsufficientPool'))
        return false
      }
      if (
        dataDraft.kind === 'asset_liability' &&
        dataDraft.mode === 'asset' &&
        !assetCanPlaceAtMonth(
          st.events,
          dataDraft,
          m,
          st.editingEventId,
          st.projectionYears,
        )
      ) {
        setDndRejection(t('dnd.assetInsufficientReserve'))
        return false
      }
      const base = { ...dataDraft, startMonth: m }
      const editId = st.editingEventId
      if (editId) {
        replaceEvent({ ...base, id: editId })
        setEditingEventId(null)
      } else {
        addEvent({ ...base, id: base.id || nextEventId('evt') })
      }
      setDraft(createDefaultEventForType(base.kind))
      return true
    },
    [addEvent, replaceEvent, setEditingEventId, t, projectionYears],
  )

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      const activeId = String(e.active.id)
      if (!activeId.startsWith('nw-drag-')) {
        const overId = e.over?.id != null ? String(e.over.id) : null
        const ids = useAppStore.getState().events.map((x) => x.id)
        if (overId && ids.includes(activeId) && ids.includes(overId)) {
          reorderEvents(ids.indexOf(activeId), ids.indexOf(overId))
        }
        return
      }

      const overId = e.over?.id
      const data = e.active.data.current as { draft?: FinancialEvent } | undefined
      const dropMonth = useAppStore.getState().dragPreviewMonth ?? 0
      if (!data?.draft || overId !== NW_GRAPH_DROP_ID) {
        setDragging(false, null)
        return
      }

      const st = useAppStore.getState()
      const horizon = simulationHorizonMonths(st.projectionYears)
      const m = Math.min(Math.max(0, dropMonth), Math.max(0, horizon - 1))
      if (
        data.draft.kind === 'investment' &&
        !investmentCanPlaceAtMonth(
          st.events,
          data.draft,
          m,
          st.editingEventId,
          st.projectionYears,
        )
      ) {
        setDragging(false, null)
        setDndRejection(t('dnd.investmentInsufficientPool'))
        return
      }
      if (
        data.draft.kind === 'asset_liability' &&
        data.draft.mode === 'asset' &&
        !assetCanPlaceAtMonth(
          st.events,
          data.draft,
          m,
          st.editingEventId,
          st.projectionYears,
        )
      ) {
        setDragging(false, null)
        setDndRejection(t('dnd.assetInsufficientReserve'))
        return
      }

      setDragging(false, null)
      commitDraftAtMonth(data.draft, dropMonth)
    },
    [commitDraftAtMonth, reorderEvents, setDragging, t],
  )

  const graphPinnedMonth = useAppStore((s) => s.graphPinnedMonth)

  const handlePlaceDraftAtPinnedMonth = useCallback(() => {
    const pm = useAppStore.getState().graphPinnedMonth
    if (pm === null || !draft) return
    commitDraftAtMonth(draft, pm)
  }, [commitDraftAtMonth, draft])

  /** Click on chart plot: stop editing a placed event only; keep unplaced draft editor open. */
  const onDismissEditOnGraphPlotClick = useCallback(() => {
    const st = useAppStore.getState()
    if (st.editingEventId === null) return
    setEditingEventId(null)
    setDraft(null)
    setSelectedEventType(null)
  }, [setEditingEventId, setSelectedEventType])

  const onPickEvent = useCallback(
    (id: string) => {
      const st = useAppStore.getState()
      const ev = st.events.find((x) => x.id === id)
      if (ev) {
        setDraft(ev)
        const horizon = simulationHorizonMonths(st.projectionYears)
        const xMax = Math.max(0, horizon - 1)
        const monthStart = Math.min(Math.max(0, ev.startMonth), xMax)
        const sameSelection = st.editingEventId === id
        const pinnedToThisStart = st.graphPinnedMonth === monthStart
        if (sameSelection && pinnedToThisStart) {
          setGraphPinnedMonth(null)
        } else {
          setGraphPinnedMonth(monthStart)
        }
      }
      setEditingEventId(id)
      if (narrow) setSheetOpen(true)
    },
    [narrow, setEditingEventId, setGraphPinnedMonth],
  )

  const onMarkerDragOverDeleteZone = useCallback((over: boolean) => {
    setCarouselDeleteHover(over)
  }, [])

  const onGraphMarkerGrabChange = useCallback((active: boolean) => {
    setGraphMarkerGrabActive(active)
  }, [])

  /** Only swap the footer to the delete target while the pointer is over it — not for every graph-marker drag. */
  const showFooterGraphMarkerDelete = graphMarkerGrabActive && carouselDeleteHover

  const handleRepositionEventOnGraph = useCallback(
    (eventId: string, rawMonth: number) => {
      const st = useAppStore.getState()
      const ev = st.events.find((e) => e.id === eventId)
      if (!ev) return false
      const horizon = simulationHorizonMonths(st.projectionYears)
      const month = Math.min(Math.max(0, rawMonth), Math.max(0, horizon - 1))
      const editId = st.editingEventId
      if (
        ev.kind === 'investment' &&
        !investmentCanPlaceAtMonth(
          st.events,
          ev,
          month,
          editId === eventId ? eventId : null,
          st.projectionYears,
        )
      ) {
        setDndRejection(t('dnd.investmentInsufficientPool'))
        return false
      }
      if (
        ev.kind === 'asset_liability' &&
        ev.mode === 'asset' &&
        !assetCanPlaceAtMonth(
          st.events,
          ev,
          month,
          editId === eventId ? eventId : null,
          st.projectionYears,
        )
      ) {
        setDndRejection(t('dnd.assetInsufficientReserve'))
        return false
      }
      const next = syncEndFromDuration({ ...ev, startMonth: month } as FinancialEvent)
      replaceEvent(next)
      if (editId === eventId) {
        setDraft(next)
      }
      return true
    },
    [replaceEvent, t],
  )

  const handleDraftChange = useCallback(
    (next: FinancialEvent) => {
      setDraft(next)
      const editId = useAppStore.getState().editingEventId
      if (editId) {
        replaceEvent({ ...next, id: editId })
      }
    },
    [replaceEvent],
  )

  const handleRemoveEventFromGraph = useCallback(
    (id: string) => {
      removeEvent(id)
      if (useAppStore.getState().editingEventId === id) {
        setEditingEventId(null)
      }
      setDraft((d) => (d?.id === id ? null : d))
    },
    [removeEvent, setEditingEventId],
  )

  const editorColumn = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden">
      <section className="shrink-0 border-b border-slate-800/80 py-2">
        <h2 className="font-display mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {t('settings.title')}
        </h2>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-slate-400">{t('settings.horizon')}</label>
          <input
            type="number"
            min={1}
            max={50}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs tabular-nums text-slate-100"
            value={projectionYears}
            onChange={(e) =>
              setProjectionYears(Math.min(50, Math.max(1, Number(e.target.value) || 30)))
            }
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
          <Toggle
            label={t('settings.realDollars')}
            on={graphSettings.showRealValues}
            onToggle={() => patchGraphSettings({ showRealValues: !graphSettings.showRealValues })}
          />
          <Toggle
            label={t('settings.linearRef')}
            on={graphSettings.showLinearReference}
            onToggle={() =>
              patchGraphSettings({ showLinearReference: !graphSettings.showLinearReference })
            }
          />
          <Toggle
            label={t('settings.breakdown')}
            on={graphSettings.showAssetBreakdown}
            onToggle={() =>
              patchGraphSettings({ showAssetBreakdown: !graphSettings.showAssetBreakdown })
            }
          />
          <Toggle
            label={t('settings.stressTest')}
            on={graphSettings.stressTestActive}
            onToggle={() => patchGraphSettings({ stressTestActive: !graphSettings.stressTestActive })}
          />
          <Toggle
            label={t('settings.mcNote')}
            on={graphSettings.showMonteCarlo}
            onToggle={() => patchGraphSettings({ showMonteCarlo: !graphSettings.showMonteCarlo })}
          />
        </div>
      </section>

      {draft && (
        <div className="relative -mx-3 flex shrink-0 items-center justify-center py-1">
          <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-600/80" aria-hidden />
          <div className="relative z-[1] bg-slate-950 px-2 py-0.5">
            <DraggableIcon
              draft={draft}
              variant="inline"
              pinPlaceEnabled={graphPinnedMonth !== null}
              onPinPlace={handlePlaceDraftAtPinnedMonth}
            />
          </div>
        </div>
      )}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden py-2">
        <h2 className="font-display mb-1.5 shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {t('editor.title')}
        </h2>
        <div
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain pr-1 touch-pan-y [-webkit-overflow-scrolling:touch]"
          data-testid="event-form-scroll"
        >
          <EventForm draft={draft} onChange={handleDraftChange} />
        </div>
      </section>
    </div>
  )

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-slate-950 text-slate-200 md:flex-row">
        {!narrow && (
          <motion.aside
            layout
            className="flex h-full max-h-full min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-slate-800 md:w-[min(420px,100%)] md:border-b-0 md:border-r 2xl:w-[min(440px,100%)]"
          >
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-800/80 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-lg font-semibold tracking-tight text-slate-50 md:text-xl">
                  {t('app.title')}
                </h1>
                <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{t('app.tagline')}</p>
              </div>
              <LanguageIconButton />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-1">{editorColumn}</div>
          </motion.aside>
        )}

        {narrow && (
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-slate-100">
              {t('app.titleShort')}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <LanguageIconButton className="h-8 w-8" />
              <button
                type="button"
                className="rounded-md bg-slate-800 px-3 py-1 text-xs"
                onClick={() => setSheetOpen(true)}
              >
                {t('mobile.editEvents')}
              </button>
            </div>
          </header>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main
            className={`relative flex min-h-0 flex-1 flex-col overflow-hidden p-2 md:p-3 ${
              narrow ? 'pb-[5.5rem]' : ''
            }`}
          >
            {(events.length > 0 ||
              (isDragging && draggingDraft !== null && dragPreviewMonth !== null)) && (
              <HeroKpiStrip />
            )}
            <DropZone
              dropInvalid={placementPreviewInvalid}
              graphMarkerRepositioning={markerDragPreview !== null}
              graphPinned={graphPinnedMonth !== null}
              className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            >
              {dndRejection && (
                <p
                  role="alert"
                  className="pointer-events-none absolute left-1/2 top-2 z-30 max-w-[min(420px,92vw)] -translate-x-1/2 rounded-md border border-rose-500/40 bg-rose-950/90 px-3 py-2 text-center text-[11px] leading-snug text-rose-100 shadow-lg"
                >
                  {dndRejection}
                </p>
              )}
              <div
                ref={graphPlotRef}
                data-testid="graph-plot-area"
                className="relative flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden"
              >
                {events.length === 0 && !(isDragging && draggingDraft) ? (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-slate-800/90 bg-slate-900/30 px-4 py-4 text-center">
                    <div className="text-3xl" aria-hidden>
                      📉
                    </div>
                    <div className="min-w-0 px-1">
                      <p className="font-display text-sm font-semibold text-slate-200">
                        {t('emptyState.headline')}
                      </p>
                      <p className="mx-auto mt-1 max-w-sm text-[11px] leading-snug text-slate-500">
                        {t('emptyState.body')}
                      </p>
                    </div>
                    <p className="text-[10px] text-teal-500/90">{t('emptyState.carouselCue')}</p>
                  </div>
                ) : (
                  <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
                    {events.length > 0 && (
                      <div className="flex shrink-0 flex-col" data-testid="life-timeline-block">
                        <button
                          type="button"
                          className="flex w-full shrink-0 items-center gap-1.5 border-b border-slate-800/70 py-1.5 text-left text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 transition-colors hover:bg-slate-900/55 hover:text-slate-300"
                          style={{ paddingLeft: GRAPH_MARGIN.left, paddingRight: 12 }}
                          aria-expanded={graphSettings.showLifeTimeline}
                          aria-controls="life-timeline-ruler-svg"
                          title={t('graph.lifeRulerToggleTooltip')}
                          onClick={() =>
                            patchGraphSettings({ showLifeTimeline: !graphSettings.showLifeTimeline })
                          }
                        >
                          <span className="inline-block w-3 shrink-0 text-center text-[10px] text-slate-600" aria-hidden>
                            {graphSettings.showLifeTimeline ? '▼' : '▶'}
                          </span>
                          {t('graph.lifeRulerTitle')}
                        </button>
                        {graphSettings.showLifeTimeline && lifeTimelineBodyHeight > 0 ? (
                          <LifeTimelineRuler
                            id="life-timeline-ruler-svg"
                            width={width > 8 ? width : 120}
                            height={lifeTimelineBodyHeight}
                            events={mergedTimelineEvents}
                            projectionYears={projectionYears}
                            currentAge={currentAge}
                            translate={t}
                            titleInSvg={false}
                            onSelectEvent={onPickEvent}
                          />
                        ) : null}
                      </div>
                    )}
                    <div className="min-h-0 flex-1">
                      <NetWorthGraph
                        width={width > 8 ? width : 120}
                        height={
                          height > 8
                            ? Math.max(80, height - lifeTimelineBlockHeight)
                            : 120
                        }
                        dropInvalid={placementPreviewInvalid}
                        onPickEvent={onPickEvent}
                        onGraphPlotClick={onDismissEditOnGraphPlotClick}
                        onRemoveEvent={handleRemoveEventFromGraph}
                        onRepositionEventStartMonth={handleRepositionEventOnGraph}
                        carouselDeleteZoneRef={carouselDeleteZoneRef}
                        onMarkerDragOverDeleteZone={onMarkerDragOverDeleteZone}
                        onGraphMarkerGrabChange={onGraphMarkerGrabChange}
                      />
                    </div>
                  </div>
                )}
              </div>
            </DropZone>

            <footer
              className={`max-h-[5.25rem] w-full shrink-0 overflow-hidden ${
                narrow
                  ? 'fixed bottom-0 left-0 right-0 z-20 border-t border-slate-800 bg-slate-950/95 p-2 backdrop-blur-md'
                  : 'relative z-0 mt-3'
              }`}
            >
              <div
                ref={carouselDeleteZoneRef}
                className={`relative flex flex-col ${
                  showFooterGraphMarkerDelete
                    ? narrow
                      ? 'max-h-[4.75rem] min-h-[4.75rem] items-stretch overflow-hidden rounded-lg border border-rose-500/35 bg-rose-950/55 ring-2 ring-rose-400'
                      : 'max-h-[5.25rem] min-h-[5.25rem] items-stretch overflow-hidden rounded-xl border border-rose-500/40 bg-rose-950/50 p-2 shadow-xl ring-2 ring-rose-400 ring-offset-2 ring-offset-slate-950 backdrop-blur-md'
                    : narrow
                      ? 'max-h-[4.75rem] min-h-0 overflow-hidden'
                      : 'max-h-[5.25rem] min-h-0 overflow-hidden rounded-xl border border-slate-800/90 bg-slate-950/92 p-2 shadow-xl backdrop-blur-md'
                }`}
                aria-label={showFooterGraphMarkerDelete ? t('carousel.deleteDropActive') : undefined}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {showFooterGraphMarkerDelete ? (
                    <motion.div
                      key="nw-footer-delete-zone"
                      role="status"
                      className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-0.5 px-2 text-center"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <span className="text-base leading-none" aria-hidden>
                        🗑️
                      </span>
                      <span className="font-display text-[11px] font-semibold tracking-wide text-rose-100">
                        {t('carousel.deleteDropZoneTitle')}
                      </span>
                      <span className="max-w-[20rem] text-[9px] leading-snug text-rose-300/95">
                        {t('carousel.deleteDropZoneSubtitle')}
                      </span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="nw-footer-carousel"
                      className="min-h-0 w-full flex-1"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <EventCarousel
                        selected={selectedEventType}
                        highlightCue={carouselHint}
                        onSelect={(eventType: EventType) => {
                          dismissCarouselHint()
                          setSelectedEventType(eventType)
                          setEditingEventId(null)
                          setDraft(createDefaultEventForType(eventType))
                          if (narrow) setSheetOpen(true)
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </footer>
          </main>
        </div>

        <AnimatePresence>
          {narrow && sheetOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
              onClick={() => setSheetOpen(false)}
            >
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 28 }}
                className="absolute left-0 top-0 flex h-full max-h-full w-[min(100%,400px)] flex-col overflow-hidden border-r border-slate-800 bg-slate-950 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-3 py-2.5">
                  <h2 className="min-w-0 flex-1 font-display text-sm font-semibold">{t('sheet.title')}</h2>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <LanguageIconButton className="h-8 w-8" />
                    <button
                      type="button"
                      className="shrink-0 text-slate-400 hover:text-slate-200"
                      onClick={() => setSheetOpen(false)}
                    >
                      {t('sheet.close')}
                    </button>
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-2">{editorColumn}</div>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DndContext>
  )
}

function Toggle({
  label,
  title,
  on,
  onToggle,
}: {
  label: string
  /** Optional tooltip (e.g. clarify what the setting does). */
  title?: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onToggle}
      className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
        on ? 'bg-teal-900/50 text-teal-200 ring-1 ring-teal-500/30' : 'bg-slate-800 text-slate-400'
      }`}
    >
      {label}
    </button>
  )
}
