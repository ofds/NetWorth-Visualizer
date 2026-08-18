import * as d3 from 'd3'
import type { TFunction } from 'i18next'
import { motion } from 'framer-motion'
import type { RefObject } from 'react'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { MonthSnapshot } from '../../engine/types'
import { LEDGER_RESIDUAL_EVENT_ID } from '../../engine/types'
import { eventEmoji } from '../../events/eventEmoji'
import type { FinancialEvent } from '../../events/types'
import { investmentShortfallStreakIds } from '../../engine/investmentShortfallStreak'
import { detectMilestones } from '../../engine/milestones'
import { eventsWithStressMacro } from '../../engine/stressTestEvents'
import { assetCanPlaceAtMonth, totalAssetDownPaymentShortfallForEventFromSnapshots } from '../../engine/assetPlacement'
import {
  investmentCanPlaceAtMonth,
  totalInvestmentShortfallForEventFromSnapshots,
} from '../../engine/investmentPlacement'
import { simulate, simulationHorizonMonths } from '../../engine/simulate'
import { snapshotInflationScale } from '../../engine/snapshotDisplay'
import { syncEndFromDuration } from '../../events/syncEventWindow'
import { AnimatedCurrency } from '../shared/AnimatedCurrency'
import { useAppStore, type AppLang } from '../../store/useAppStore'
import { clamp, clientXToMonthIndexInDomain } from '../../utils/timelineCoords'
import {
  accent,
  eventColorFor,
  eventTintHex,
  eventTypeColors,
  graphAssetAreaColors,
  graphAssetColors,
  investmentRibbonFill,
} from '../../utils/colors'
import {
  formatCurrency,
  formatMilestoneDateShort,
  formatSimulationMonthShort,
} from '../../utils/formatting'
import {
  GRAPH_MARGIN,
  buildLinearReferencePoints,
  calendarYearForSimulationMonth,
  drawGrid,
  drawZeroLine,
  eventMarkerXs,
  layoutStackedGraphEventMarkers,
  monthColumnBandInner,
  pickYValue,
  xAxisMonthTicks,
} from './GraphLayers'
import {
  ASSET_STACK_INV_PREFIX,
  axisMoney,
  buildAssetStackRowsForChart,
  hoverStateForMonth,
  investmentIdsOrderedForAssetStack,
  assetStackRowKeys,
  totalLiabilitiesDisplay,
  POOL_FLOW_LINE_I18N,
  type GraphHoverState,
} from './netWorthGraphModel'
import {
  applyTooltipEdgeResize,
  clampTooltipBoxDom,
  clientInElementRect,
  computeTooltipDensityStage,
  getTooltipHorizontalLayout,
  GRAPH_TOOLTIP_DEFAULT_H,
  GRAPH_TOOLTIP_DEFAULT_W,
  GRAPH_TOOLTIP_MIN_H,
  GRAPH_TOOLTIP_MIN_W,
  type GraphTooltipResizeEdge,
} from './netWorthGraphTooltipLayout'
import {
  buildMilestoneSegFlat,
  drawMilestoneVlinesAndPlotLabels,
  type MilestoneSegDraw,
} from './milestoneDraw'
import {
  applyAssetStackHover,
  applyDebtHover,
  pickAssetStackLayer,
  type AssetStackGeom,
} from './assetStackInteraction'
import {
  clientXToInnerPlotX,
  domainFromBrushMonths,
  effectiveXDomain,
  filterTickValuesToVisibleDomain,
  isFullXDomain,
} from './graphXDomain'

const MARKER_DRAG_THRESHOLD_PX = 8
/** Ignore brush gestures shorter than this (px). */
const X_BRUSH_DRAG_THRESHOLD_PX = 8
/**
 * Hit target height for horizontal zoom brush.
 * We intentionally include some area below `innerH` so users can drag on the x-axis label/tick region.
 */
const X_AXIS_BRUSH_BAND_PX = 28
/** Extra hit area below the x-axis line (within the chart container). */
const X_AXIS_BRUSH_BELOW_PX = 18
const MARKER_STACK_STEP_PX = 12

/** Largest step ≤ `step` in the arrow direction where `canPlace(t)` holds (invalid months are skipped). */
function bestKeyboardMoveMonth(
  current: number,
  dir: -1 | 1,
  step: number,
  maxM: number,
  canPlace: (m: number) => boolean,
): number | null {
  for (let s = step; s >= 1; s--) {
    const t = current + dir * s
    if (t < 0 || t > maxM) continue
    if (canPlace(t)) return t
  }
  return null
}

type Props = {
  width: number
  height: number
  /** While dragging a new event from the carousel: placement is invalid at the preview month (matches DropZone). */
  dropInvalid?: boolean
  onPickEvent?: (eventId: string) => void
  onRemoveEvent?: (eventId: string) => void
  /** Click on plot background (not markers): e.g. dismiss editor when editing a placed event. */
  onGraphPlotClick?: () => void
  /** Return false if the move was rejected (e.g. investment pool constraint). */
  onRepositionEventStartMonth?: (eventId: string, newStartMonth: number) => boolean
  /** Hit target for “drop on carousel to delete” while dragging a graph marker. */
  carouselDeleteZoneRef?: RefObject<HTMLElement | null>
  /** Called when graph-marker drag enters/leaves the carousel delete zone (for UI highlight). */
  onMarkerDragOverDeleteZone?: (over: boolean) => void
  /** True while a graph event marker is pressed / held / being dragged (shows delete drop zone). */
  onGraphMarkerGrabChange?: (active: boolean) => void
}

export function NetWorthGraph({
  width,
  height,
  dropInvalid = false,
  onPickEvent,
  onRemoveEvent,
  onGraphPlotClick,
  onRepositionEventStartMonth,
  carouselDeleteZoneRef,
  onMarkerDragOverDeleteZone,
  onGraphMarkerGrabChange,
}: Props) {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const snapshots = useAppStore((s) => s.simulation)
  const events = useAppStore((s) => s.events)
  const milestones = useAppStore((s) => s.milestones)
  const currency = useAppStore((s) => s.currency)
  const appLang = useAppStore((s) => s.lang)
  const graphSettings = useAppStore((s) => s.graphSettings)
  const isDragging = useAppStore((s) => s.isDragging)
  const dragPreviewMonth = useAppStore((s) => s.dragPreviewMonth)
  const draggingDraft = useAppStore((s) => s.draggingDraft)
  /** Shared live preview simulation (computed once per drag in `setDragging`). */
  const previewSnapshots = useAppStore((s) => s.dragPreviewSnapshots)
  const setMarkerDragPreview = useAppStore((s) => s.setMarkerDragPreview)
  const setMarkerDragPlacementInvalid = useAppStore((s) => s.setMarkerDragPlacementInvalid)
  const projectionYears = useAppStore((s) => s.projectionYears)
  const graphPinnedMonth = useAppStore((s) => s.graphPinnedMonth)
  const setGraphPinnedMonth = useAppStore((s) => s.setGraphPinnedMonth)
  const patchGraphSettings = useAppStore((s) => s.patchGraphSettings)

  const previewBaselineSnapshots = useMemo(() => {
    if (!previewSnapshots?.length) return null
    const n = previewSnapshots.length
    if (snapshots.length === n) return snapshots
    return simulate(events, new Date(), n)
  }, [snapshots, previewSnapshots, events])

  const [markerDrag, setMarkerDrag] = useState<{
    id: string
    originMonth: number
    clientX0: number
    clientY0: number
    previewMonth: number
  } | null>(null)
  const markerDragRef = useRef(markerDrag)
  markerDragRef.current = markerDrag
  /** Only true after movement exceeds click-vs-drag threshold — avoids flashing the carousel delete zone on simple marker clicks. */
  const markerDragBeyondThresholdRef = useRef(false)
  /** `graphPinnedMonth` at marker pointer-down; used to restore pin on release only if it was pinned before the drag. */
  const pinnedMonthBeforeMarkerDragRef = useRef<number | null>(null)
  /** Marker drag updates hover targets every frame; skip currency RAF/digit-roll to avoid feedback with rapid re-renders. */
  const tooltipCurrencyAnimate = markerDrag === null

  /** Session-only stack of prior visible X domains for “zoom back”. */
  const [xZoomHistory, setXZoomHistory] = useState<[number, number][]>([])
  const isXBrushDraggingRef = useRef(false)
  const suppressPlotClickRef = useRef(false)
  const xBrushSessionRef = useRef<{
    pointerId: number
    innerX0: number
    month0: number
  } | null>(null)
  const [xBrushOverlayPx, setXBrushOverlayPx] = useState<[number, number] | null>(null)
  const [xBrushSelectedMonths, setXBrushSelectedMonths] = useState<readonly [number, number] | null>(null)
  const xBrushSelectedMonthsRef = useRef<readonly [number, number] | null>(null)

  const deferredMarkerPreviewMonth = useDeferredValue(markerDrag?.previewMonth ?? null)
  const markerDragSnapshots = useMemo(() => {
    if (!markerDrag) return null
    if (!events.some((e) => e.id === markerDrag.id)) return null
    const months = simulationHorizonMonths(projectionYears)
    const pm = deferredMarkerPreviewMonth ?? markerDrag.previewMonth
    const merged = events.map((e) =>
      e.id === markerDrag.id
        ? syncEndFromDuration({ ...e, startMonth: pm } as FinancialEvent)
        : e,
    )
    return simulate(merged, new Date(), months)
  }, [markerDrag, events, projectionYears, deferredMarkerPreviewMonth])

  useLayoutEffect(() => {
    if (!markerDrag) {
      setMarkerDragPlacementInvalid(null)
      return
    }
    const ev = events.find((e) => e.id === markerDrag.id)
    if (!ev || !markerDragSnapshots?.length) {
      setMarkerDragPlacementInvalid(null)
      return
    }
    if (ev.kind === 'investment') {
      const total = totalInvestmentShortfallForEventFromSnapshots(markerDragSnapshots, markerDrag.id)
      setMarkerDragPlacementInvalid(total !== 0)
      return
    }
    if (ev.kind === 'asset_liability' && ev.mode === 'asset') {
      const total = totalAssetDownPaymentShortfallForEventFromSnapshots(
        markerDragSnapshots,
        markerDrag.id,
      )
      setMarkerDragPlacementInvalid(total !== 0)
      return
    }
    setMarkerDragPlacementInvalid(null)
  }, [markerDrag, events, markerDragSnapshots, setMarkerDragPlacementInvalid])

  const eventsForMarkers = useMemo(() => {
    if (!markerDrag) return events
    return events.map((e) =>
      e.id === markerDrag.id
        ? syncEndFromDuration({ ...e, startMonth: markerDrag.previewMonth } as FinancialEvent)
        : e,
    )
  }, [events, markerDrag])

  const stressSnapshots = useMemo(() => {
    if (!graphSettings.stressTestActive || events.length === 0) return null
    const months = simulationHorizonMonths(projectionYears)
    return simulate(eventsWithStressMacro(events), new Date(), months)
  }, [graphSettings.stressTestActive, events, projectionYears])

  /** Hovering a per-investment ribbon (breakdown on): show that account’s balance for the hovered month. */
  const [investmentStackHoverSlice, setInvestmentStackHoverSlice] = useState<{
    eventId: string
    name: string
    amount: number
  } | null>(null)

  const assetStackGeomRef = useRef<AssetStackGeom | null>(null)
  const assetStackHoverKeyRef = useRef<string | null>(null)

  const [ghostHoverId, setGhostHoverId] = useState<string | null>(null)
  const [ghostDebouncedId, setGhostDebouncedId] = useState<string | null>(null)
  const [ghostHoverAnchor, setGhostHoverAnchor] = useState<{
    id: string
    xCenter: number
    yCenter: number
  } | null>(null)
  const ghostLeaveTimerRef = useRef<number | null>(null)
  const clearGhostLeaveTimer = useCallback(() => {
    if (ghostLeaveTimerRef.current !== null) {
      window.clearTimeout(ghostLeaveTimerRef.current)
      ghostLeaveTimerRef.current = null
    }
  }, [])
  useEffect(() => {
    const id = window.setTimeout(() => setGhostDebouncedId(ghostHoverId), 150)
    return () => window.clearTimeout(id)
  }, [ghostHoverId])
  useEffect(() => clearGhostLeaveTimer, [clearGhostLeaveTimer])
  useEffect(() => {
    if (ghostHoverId === null) {
      setGhostHoverAnchor(null)
    }
  }, [ghostHoverId])

  const ghostSnapshots = useMemo(() => {
    if (!ghostDebouncedId) return null
    const merged = events.filter((e) => e.id !== ghostDebouncedId)
    if (merged.length === events.length) return null
    const months = simulationHorizonMonths(projectionYears)
    return simulate(merged, new Date(), months)
  }, [ghostDebouncedId, events, projectionYears])

  /** Dotted lines + labels; align with store during normal drag, but follow marker-drag preview sim. */
  const milestonesForGraph = useMemo(() => {
    if (markerDragSnapshots?.length) return detectMilestones(markerDragSnapshots)
    return milestones
  }, [markerDragSnapshots, milestones])

  const shortfallBadgeIds = useMemo(
    () =>
      investmentShortfallStreakIds(
        markerDragSnapshots?.length ? markerDragSnapshots : snapshots,
        eventsForMarkers,
      ),
    [markerDragSnapshots, snapshots, eventsForMarkers],
  )

  /** Investment event ids by strength under the net-worth line (matches stacked split order). */
  const stackInvestmentIdsOrdered = useMemo(() => {
    const snaps = markerDragSnapshots?.length ? markerDragSnapshots : snapshots
    if (snaps.length === 0) return []
    return investmentIdsOrderedForAssetStack(snaps, eventsForMarkers)
  }, [markerDragSnapshots, snapshots, eventsForMarkers])

  const plotGeometry = useMemo(() => {
    const hasMarkerPreview = Boolean(markerDragSnapshots?.length)
    const displaySnapshots = hasMarkerPreview ? markerDragSnapshots! : snapshots
    const hasMain = displaySnapshots.length > 0
    const hasPrev =
      !hasMarkerPreview && previewSnapshots !== null && previewSnapshots.length > 0
    if (!hasMain && !hasPrev) return null
    const { top, right, bottom, left } = GRAPH_MARGIN
    const innerW = width - left - right
    const innerH = height - top - bottom
    if (innerW <= 0 || innerH <= 0) return null
    const useReal = graphSettings.showRealValues
    const xLen = Math.max(displaySnapshots.length, previewSnapshots?.length ?? 0, 2)
    const xMax = Math.max(1, xLen - 1)
    const xDomain = effectiveXDomain(xMax, graphSettings.zoomRange)
    const xLo = xDomain[0]
    const xHi = xDomain[1]
    const xScale = d3.scaleLinear().domain([xDomain[0], xDomain[1]]).range([0, innerW])

    // Only compute y-domain over the currently visible x-range (so zoom changes the Y scale).
    const mainVals = hasMain ? displaySnapshots.slice(xLo, xHi + 1).map((d) => pickYValue(d, useReal)) : []
    const mainDebtNegVals = hasMain
      ? displaySnapshots.slice(xLo, xHi + 1).map((d) => -totalLiabilitiesDisplay(d, useReal))
      : []
    const prevVals = hasPrev ? previewSnapshots!.slice(xLo, xHi + 1).map((d) => pickYValue(d, useReal)) : []
    const prevDebtNegVals = hasPrev
      ? previewSnapshots!.slice(xLo, xHi + 1).map((d) => -totalLiabilitiesDisplay(d, useReal))
      : []
    const stressVals =
      graphSettings.stressTestActive && stressSnapshots?.length
        ? stressSnapshots.slice(xLo, xHi + 1).map((d) => pickYValue(d, useReal))
        : []
    const stressDebtNegVals =
      graphSettings.stressTestActive && stressSnapshots?.length
        ? stressSnapshots.slice(xLo, xHi + 1).map((d) => -totalLiabilitiesDisplay(d, useReal))
        : []
    const ghostVals =
      ghostSnapshots?.length && ghostSnapshots.length > 0
        ? ghostSnapshots.slice(xLo, xHi + 1).map((d) => pickYValue(d, useReal))
        : []
    const ghostDebtNegVals =
      ghostSnapshots?.length && ghostSnapshots.length > 0
        ? ghostSnapshots.slice(xLo, xHi + 1).map((d) => -totalLiabilitiesDisplay(d, useReal))
        : []
    const values = [
      ...mainVals,
      ...mainDebtNegVals,
      ...prevVals,
      ...prevDebtNegVals,
      ...stressVals,
      ...stressDebtNegVals,
      ...ghostVals,
      ...ghostDebtNegVals,
    ]
    const yMin = Math.min(0, d3.min(values) ?? 0)
    const yMax = Math.max(0, d3.max(values) ?? 0)
    const yPad = (yMax - yMin) * 0.08 || 1
    const hMain = innerH
    const yScale = d3
      .scaleLinear()
      .domain([yMin - yPad, yMax + yPad])
      .nice()
      .range([hMain, 0])
    const series: MonthSnapshot[] = hasMain ? displaySnapshots : previewSnapshots!
    return {
      left,
      top,
      innerW,
      innerH,
      hMain,
      xMax,
      xDomain,
      xScale,
      yScale,
      series,
      useReal,
    }
  }, [
    width,
    height,
    snapshots,
    markerDragSnapshots,
    previewSnapshots,
    graphSettings.showRealValues,
    graphSettings.stressTestActive,
    graphSettings.zoomRange,
    stressSnapshots,
    ghostSnapshots,
  ])

  const plotGeometryRef = useRef(plotGeometry)
  plotGeometryRef.current = plotGeometry

  const markerLayouts = useMemo(() => {
    if (!plotGeometry) return []
    const raw = eventMarkerXs(eventsForMarkers, plotGeometry.xMax)
    const stacked = layoutStackedGraphEventMarkers(raw, plotGeometry.xMax, plotGeometry.innerW, 15)
    const { xScale, yScale, series, useReal, left, top } = plotGeometry
    return stacked.map((s) => {
      const ev = eventsForMarkers.find((e) => e.id === s.id)
      const mi = Math.min(Math.max(0, s.month), Math.max(0, series.length - 1))
      const snap = series[mi]
      const yOnCurve = snap ? yScale(pickYValue(snap, useReal)) : plotGeometry.hMain / 2
      const xCenter = left + xScale(s.month)
      const yCenter = top + yOnCurve - s.stackIndex * MARKER_STACK_STEP_PX
      return { ...s, xCenter, yCenter, ev }
    })
  }, [plotGeometry, eventsForMarkers])

  const suppressMarkerClickRef = useRef(false)
  const markerDeleteHoverRef = useRef(false)
  const debtHoverActiveRef = useRef(false)

  const totalSimMonths = useMemo(() => simulationHorizonMonths(projectionYears), [projectionYears])

  const setDeleteZoneHover = useCallback(
    (over: boolean) => {
      if (markerDeleteHoverRef.current === over) return
      markerDeleteHoverRef.current = over
      onMarkerDragOverDeleteZone?.(over)
    },
    [onMarkerDragOverDeleteZone],
  )

  const onMarkerPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const cur = markerDragRef.current
      if (!cur) return
      const plot = plotRef.current
      if (!plot) return
      const rect = plot.getBoundingClientRect()
      const xMaxIdx = Math.max(0, totalSimMonths - 1)
      const dom = effectiveXDomain(xMaxIdx, useAppStore.getState().graphSettings.zoomRange)
      const m = clamp(
        clientXToMonthIndexInDomain(
          e.clientX,
          rect,
          totalSimMonths,
          GRAPH_MARGIN.left,
          GRAPH_MARGIN.right,
          dom,
        ),
        0,
        xMaxIdx,
      )
      const moved =
        Math.hypot(e.clientX - cur.clientX0, e.clientY - cur.clientY0) > MARKER_DRAG_THRESHOLD_PX
      if (moved && !markerDragBeyondThresholdRef.current) {
        markerDragBeyondThresholdRef.current = true
        onGraphMarkerGrabChange?.(true)
        /** Unpin tooltip while dragging so the panel follows the preview month, not the old pin. */
        setGraphPinnedMonth(null)
      }
      const delEl = carouselDeleteZoneRef?.current
      const overDelete =
        !!delEl && clientInElementRect(e.clientX, e.clientY, delEl as HTMLElement)
      setDeleteZoneHover(overDelete)
      setMarkerDrag((prev) => (prev ? { ...prev, previewMonth: m } : prev))
      setMarkerDragPreview({ eventId: cur.id, startMonth: m })
    },
    [
      totalSimMonths,
      carouselDeleteZoneRef,
      setDeleteZoneHover,
      setMarkerDragPreview,
      onGraphMarkerGrabChange,
      setGraphPinnedMonth,
    ],
  )

  const endMarkerPointer = useCallback(
    (e: React.PointerEvent) => {
      const prev = markerDragRef.current
      const hadPinnedBeforeDrag = pinnedMonthBeforeMarkerDragRef.current
      pinnedMonthBeforeMarkerDragRef.current = null
      const target = e.currentTarget as HTMLElement
      if (target.hasPointerCapture(e.pointerId)) {
        target.releasePointerCapture(e.pointerId)
      }
      markerDragBeyondThresholdRef.current = false
      onGraphMarkerGrabChange?.(false)
      setMarkerDrag(null)
      setMarkerDragPreview(null)
      setDeleteZoneHover(false)
      if (!prev) return
      suppressMarkerClickRef.current = true
      const moved =
        Math.hypot(e.clientX - prev.clientX0, e.clientY - prev.clientY0) > MARKER_DRAG_THRESHOLD_PX
      if (!moved) {
        onPickEvent?.(prev.id)
        return
      }
      const delEl = carouselDeleteZoneRef?.current
      if (delEl && clientInElementRect(e.clientX, e.clientY, delEl as HTMLElement)) {
        onRemoveEvent?.(prev.id)
        setGraphPinnedMonth(null)
        return
      }
      const plot = plotRef.current
      const xMaxIdx = Math.max(0, totalSimMonths - 1)
      const dom = effectiveXDomain(xMaxIdx, useAppStore.getState().graphSettings.zoomRange)
      const releaseMonth = plot
        ? clamp(
            clientXToMonthIndexInDomain(
              e.clientX,
              plot.getBoundingClientRect(),
              totalSimMonths,
              GRAPH_MARGIN.left,
              GRAPH_MARGIN.right,
              dom,
            ),
            0,
            xMaxIdx,
          )
        : clamp(prev.previewMonth, 0, xMaxIdx)
      if (releaseMonth !== prev.originMonth) {
        const ok = onRepositionEventStartMonth?.(prev.id, releaseMonth) ?? true
        if (hadPinnedBeforeDrag !== null) {
          if (ok) setGraphPinnedMonth(releaseMonth)
          else setGraphPinnedMonth(prev.originMonth)
        }
      } else if (hadPinnedBeforeDrag !== null) {
        setGraphPinnedMonth(releaseMonth)
      }
    },
    [
      onPickEvent,
      onRepositionEventStartMonth,
      onRemoveEvent,
      carouselDeleteZoneRef,
      setDeleteZoneHover,
      onGraphMarkerGrabChange,
      setMarkerDragPreview,
      setGraphPinnedMonth,
      totalSimMonths,
    ],
  )

  const [hover, setHover] = useState<GraphHoverState | null>(null)
  /** Accordion: expand “Change vs prior month” into by-source breakdown. */
  const [deltaBreakdownExpanded, setDeltaBreakdownExpanded] = useState(false)
  /** Accordion: reserve pool ins & outs. */
  const [reserveFlowExpanded, setReserveFlowExpanded] = useState(false)
  /** Hovered milestone segment (transient; can coexist with pinned chip). */
  const [milestoneHoverKey, setMilestoneHoverKey] = useState<string | null>(null)
  /** While month is pinned, holds the milestone segment key to keep that chip visible. */
  const [milestonePinnedKey, setMilestonePinnedKey] = useState<string | null>(null)
  const milestoneHoverClearTimerRef = useRef<number | null>(null)
  const cancelMilestoneHoverClear = useCallback(() => {
    if (milestoneHoverClearTimerRef.current !== null) {
      window.clearTimeout(milestoneHoverClearTimerRef.current)
      milestoneHoverClearTimerRef.current = null
    }
  }, [])
  /** Delayed clear so pointer can move from inflation line → chip without flicker. */
  const scheduleMilestoneHoverClear = useCallback(() => {
    cancelMilestoneHoverClear()
    milestoneHoverClearTimerRef.current = window.setTimeout(() => {
      milestoneHoverClearTimerRef.current = null
      setMilestoneHoverKey(null)
    }, 150)
  }, [cancelMilestoneHoverClear])

  useEffect(() => {
    setDeltaBreakdownExpanded(false)
  }, [hover?.month])

  /** Collapse reserve ins/outs only when the tooltip closes — not when scrubbing months (that would fight expand). */
  useEffect(() => {
    if (hover === null) setReserveFlowExpanded(false)
  }, [hover])

  useEffect(() => {
    if (!graphSettings.showAssetBreakdown) setInvestmentStackHoverSlice(null)
  }, [graphSettings.showAssetBreakdown])

  const poolFlowIns = useMemo(
    () => (hover?.poolFlowLines ?? []).filter((l) => l.kind === 'in'),
    [hover?.poolFlowLines],
  )
  const poolFlowOuts = useMemo(
    () => (hover?.poolFlowLines ?? []).filter((l) => l.kind === 'out'),
    [hover?.poolFlowLines],
  )

  /** Unpin (or no pin): clear milestone chip state. Must not depend on `milestoneHoverKey` or hovering would clear itself. */
  useEffect(() => {
    if (graphPinnedMonth !== null) return
    cancelMilestoneHoverClear()
    setMilestonePinnedKey(null)
    setMilestoneHoverKey(null)
  }, [graphPinnedMonth, cancelMilestoneHoverClear])

  /** While pinned, capture the first hovered segment key for the sticky chip. */
  useEffect(() => {
    if (graphPinnedMonth === null) return
    setMilestonePinnedKey((prev) => (prev === null ? milestoneHoverKey : prev))
  }, [graphPinnedMonth, milestoneHoverKey])

  /** Inner-plot horizontal band for the hover month highlight (discrete month columns). */
  const [plotCrosshairBand, setPlotCrosshairBand] = useState<{ left: number; width: number } | null>(
    null,
  )
  const [tooltipDragOffset, setTooltipDragOffset] = useState<{ x: number; y: number } | null>(null)
  const tooltipDragSessionRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startOffsetX: number
    startOffsetY: number
  } | null>(null)
  const [tooltipResizeLive, setTooltipResizeLive] = useState<{
    w: number
    h: number
    tx: number
    ty: number
  } | null>(null)
  const tooltipResizeSessionRef = useRef<{
    pointerId: number
    edge: GraphTooltipResizeEdge
    startClientX: number
    startClientY: number
    startW: number
    startH: number
    startTx: number
    startTy: number
  } | null>(null)
  const pinnedMonthRef = useRef<number | null>(null)
  /** First ArrowLeft/Right keydown time while pinned — larger steps after longer hold. */
  const arrowPinHoldStartRef = useRef<number | null>(null)

  const graphMilestoneContextRef = useRef<{
    innerW: number
    innerH: number
    xLen: number
    xScale: d3.ScaleLinear<number, number>
    segFlat: MilestoneSegDraw[]
    useRealDollars: boolean
    milestonePad: number
    milestoneLabelTop: number
    milestoneLineTop: number
    lang: AppLang
    currency: string
    t: TFunction
    cancelMilestoneHoverClear: () => void
    scheduleMilestoneHoverClear: () => void
    setMilestoneHoverKey: (k: string | null) => void
  } | null>(null)

  /** True while milestone SVG nodes are being torn down/rebuilt — ignore spurious mouseleave. */
  const milestoneDomRefreshRef = useRef(false)

  const clampTooltipTranslate = useCallback((x: number, y: number): { x: number; y: number } => {
    const plot = plotRef.current
    const tip = tooltipRef.current
    if (!plot || !tip) return { x, y }
    const pad = 6
    const W = plot.clientWidth
    const H = plot.clientHeight
    const w = tip.offsetWidth
    const h = tip.offsetHeight
    if (w <= 0 || h <= 0) return { x, y }
    const left0 = W - 8 - w
    const top0 = 8
    const left = left0 + x
    const top = top0 + y
    const maxLeft = Math.max(pad, W - w - pad)
    const minLeft = Math.min(pad, maxLeft)
    const maxTop = Math.max(pad, H - h - pad)
    const minTop = Math.min(pad, maxTop)
    const leftCl = Math.min(Math.max(left, minLeft), maxLeft)
    const topCl = Math.min(Math.max(top, minTop), maxTop)
    return { x: x + (leftCl - left), y: y + (topCl - top) }
  }, [])

  const savedTooltipW = Math.max(
    graphSettings.graphTooltipWidth ?? GRAPH_TOOLTIP_DEFAULT_W,
    GRAPH_TOOLTIP_MIN_W,
  )
  const savedTooltipH = Math.max(
    graphSettings.graphTooltipHeight ?? GRAPH_TOOLTIP_DEFAULT_H,
    GRAPH_TOOLTIP_MIN_H,
  )
  const savedTooltipTx = graphSettings.graphTooltipOffset?.x ?? 0
  const savedTooltipTy = graphSettings.graphTooltipOffset?.y ?? 0

  const displayTooltipW = tooltipResizeLive?.w ?? savedTooltipW
  const displayTooltipH = tooltipResizeLive?.h ?? savedTooltipH
  const displayTooltipTx =
    tooltipResizeLive?.tx ?? tooltipDragOffset?.x ?? savedTooltipTx
  const displayTooltipTy =
    tooltipResizeLive?.ty ?? tooltipDragOffset?.y ?? savedTooltipTy

  const tooltipStage = useMemo(
    () => computeTooltipDensityStage(displayTooltipW, displayTooltipH),
    [displayTooltipW, displayTooltipH],
  )

  const tooltipHBox = useMemo(
    () => getTooltipHorizontalLayout(displayTooltipW),
    [displayTooltipW],
  )

  const onTooltipBarPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const base = tooltipDragOffset ?? {
        x: tooltipResizeLive?.tx ?? graphSettings.graphTooltipOffset?.x ?? 0,
        y: tooltipResizeLive?.ty ?? graphSettings.graphTooltipOffset?.y ?? 0,
      }
      tooltipDragSessionRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startOffsetX: base.x,
        startOffsetY: base.y,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [
      graphSettings.graphTooltipOffset?.x,
      graphSettings.graphTooltipOffset?.y,
      tooltipDragOffset,
      tooltipResizeLive?.tx,
      tooltipResizeLive?.ty,
    ],
  )

  const onTooltipBarPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = tooltipDragSessionRef.current
      if (!d || e.pointerId !== d.pointerId) return
      e.preventDefault()
      const rawX = d.startOffsetX + (e.clientX - d.startClientX)
      const rawY = d.startOffsetY + (e.clientY - d.startClientY)
      setTooltipDragOffset(clampTooltipTranslate(rawX, rawY))
    },
    [clampTooltipTranslate],
  )

  const endTooltipDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = tooltipDragSessionRef.current
      if (!d || e.pointerId !== d.pointerId) return
      tooltipDragSessionRef.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      setTooltipDragOffset((off) => {
        if (off != null) {
          patchGraphSettings({ graphTooltipOffset: off })
        }
        return null
      })
    },
    [patchGraphSettings],
  )

  const onTooltipResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, edge: GraphTooltipResizeEdge) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const w = tooltipResizeLive?.w ?? savedTooltipW
      const h = tooltipResizeLive?.h ?? savedTooltipH
      const tx =
        tooltipResizeLive?.tx ??
        tooltipDragOffset?.x ??
        graphSettings.graphTooltipOffset?.x ??
        0
      const ty =
        tooltipResizeLive?.ty ??
        tooltipDragOffset?.y ??
        graphSettings.graphTooltipOffset?.y ??
        0
      tooltipResizeSessionRef.current = {
        pointerId: e.pointerId,
        edge,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startW: w,
        startH: h,
        startTx: tx,
        startTy: ty,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [
      graphSettings.graphTooltipOffset?.x,
      graphSettings.graphTooltipOffset?.y,
      savedTooltipH,
      savedTooltipW,
      tooltipDragOffset?.x,
      tooltipDragOffset?.y,
      tooltipResizeLive,
    ],
  )

  const onTooltipResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = tooltipResizeSessionRef.current
    if (!d || e.pointerId !== d.pointerId) return
    e.preventDefault()
    const dx = e.clientX - d.startClientX
    const dy = e.clientY - d.startClientY
    const raw = applyTooltipEdgeResize(d.edge, dx, dy, {
      w: d.startW,
      h: d.startH,
      tx: d.startTx,
      ty: d.startTy,
    })
    const plot = plotRef.current
    if (!plot) return
    setTooltipResizeLive(clampTooltipBoxDom(plot, raw.w, raw.h, raw.tx, raw.ty))
  }, [])

  const endTooltipResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = tooltipResizeSessionRef.current
      if (!d || e.pointerId !== d.pointerId) return
      tooltipResizeSessionRef.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      setTooltipResizeLive((live) => {
        if (live != null) {
          patchGraphSettings({
            graphTooltipOffset: { x: live.tx, y: live.ty },
            graphTooltipWidth: live.w,
            graphTooltipHeight: live.h,
          })
        }
        return null
      })
    },
    [patchGraphSettings],
  )

  const resetTooltipPosition = useCallback(() => {
    tooltipDragSessionRef.current = null
    tooltipResizeSessionRef.current = null
    setTooltipDragOffset(null)
    setTooltipResizeLive(null)
    patchGraphSettings({
      graphTooltipOffset: { x: 0, y: 0 },
      graphTooltipWidth: GRAPH_TOOLTIP_DEFAULT_W,
      graphTooltipHeight: GRAPH_TOOLTIP_DEFAULT_H,
    })
  }, [patchGraphSettings])

  useEffect(() => {
    pinnedMonthRef.current = graphPinnedMonth
  }, [graphPinnedMonth])

  /** Left/Right arrows: reposition a selected investment/asset marker (invalid months skipped), else move pinned month. */
  useEffect(() => {
    const ARROW_ACCEL_MS = 200
    const ARROW_MAX_STEP = 14
    const stepForHold = () => {
      const t0 = arrowPinHoldStartRef.current
      if (t0 === null) return 1
      const elapsed = Date.now() - t0
      return Math.min(ARROW_MAX_STEP, 1 + Math.floor(elapsed / ARROW_ACCEL_MS))
    }
    const targetSkipsArrows = (el: EventTarget | null) => {
      const node = el instanceof HTMLElement ? el : null
      if (!node) return false
      if (node.closest('input, textarea, select, [contenteditable="true"]')) return true
      return false
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (targetSkipsArrows(e.target)) return
      const st = useAppStore.getState()
      const dir = (e.key === 'ArrowLeft' ? -1 : 1) as -1 | 1
      const maxM = Math.max(0, simulationHorizonMonths(st.projectionYears) - 1)
      const step = stepForHold()

      const editId = st.editingEventId
      const ev = editId ? st.events.find((x) => x.id === editId) : null
      const canReposition =
        ev &&
        onRepositionEventStartMonth &&
        (ev.kind === 'investment' || (ev.kind === 'asset_liability' && ev.mode === 'asset'))

      if (canReposition && ev) {
        e.preventDefault()
        const placeId = editId === ev.id ? editId : null
        const canPlaceAt = (m: number) => {
          if (ev.kind === 'investment') {
            return investmentCanPlaceAtMonth(st.events, ev, m, placeId, st.projectionYears)
          }
          return assetCanPlaceAtMonth(st.events, ev, m, placeId, st.projectionYears)
        }
        const currentMonth = ev.startMonth
        const nextMonth = bestKeyboardMoveMonth(currentMonth, dir, step, maxM, canPlaceAt)
        if (nextMonth === null || nextMonth === currentMonth) return
        if (!e.repeat) {
          arrowPinHoldStartRef.current = Date.now()
        }
        const ok = onRepositionEventStartMonth(ev.id, nextMonth)
        if (ok) st.setGraphPinnedMonth(nextMonth)
        return
      }

      if (st.graphPinnedMonth === null) return
      e.preventDefault()
      if (!e.repeat) {
        arrowPinHoldStartRef.current = Date.now()
      }
      const pm = st.graphPinnedMonth
      const next = clamp(pm + dir * step, 0, maxM)
      if (next !== pm) {
        st.setGraphPinnedMonth(next)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        arrowPinHoldStartRef.current = null
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    window.addEventListener('keyup', onKeyUp, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener('keyup', onKeyUp, { capture: true })
      arrowPinHoldStartRef.current = null
    }
  }, [onRepositionEventStartMonth])

  useEffect(() => {
    if (graphPinnedMonth === null) return
    if (plotGeometry) {
      setPlotCrosshairBand(
        monthColumnBandInner(
          graphPinnedMonth,
          plotGeometry.series.length,
          plotGeometry.innerW,
          plotGeometry.xScale,
        ),
      )
    }
  }, [graphPinnedMonth, plotGeometry])

  /** Keep tooltip in sync when simulation/events change (e.g. delete) without requiring mousemove. */
  /* eslint-disable react-hooks/set-state-in-effect -- derive hover from simulation snapshots */
  useEffect(() => {
    const hasMarkerPreview = Boolean(markerDragSnapshots?.length)
    const displaySnapshots = hasMarkerPreview ? markerDragSnapshots! : snapshots
    const hasMain = displaySnapshots.length > 0
    const hasPrev =
      !hasMarkerPreview && previewSnapshots !== null && previewSnapshots.length > 0
    const series =
      hasMain ? displaySnapshots : hasPrev && previewSnapshots ? previewSnapshots : []
    if (series.length === 0) {
      setHover(null)
      setGraphPinnedMonth(null)
      return
    }
    setHover((prev) => {
      if (graphPinnedMonth !== null) {
        const m = Math.min(Math.max(0, graphPinnedMonth), series.length - 1)
        return hoverStateForMonth(series, m, eventsForMarkers, graphSettings.showRealValues, t)
      }
      if (markerDrag !== null) {
        const m = Math.min(Math.max(0, markerDrag.previewMonth), series.length - 1)
        return hoverStateForMonth(series, m, eventsForMarkers, graphSettings.showRealValues, t) ?? prev
      }
      if (prev === null) return prev
      const m = Math.min(prev.month, series.length - 1)
      return hoverStateForMonth(series, m, eventsForMarkers, graphSettings.showRealValues, t) ?? prev
    })
  }, [
    snapshots,
    markerDragSnapshots,
    previewSnapshots,
    eventsForMarkers,
    graphSettings.showRealValues,
    graphPinnedMonth,
    markerDrag,
    setGraphPinnedMonth,
    t,
  ])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const el = svgRef.current
    if (!el || width < 48 || height < 48) return

    const hasMarkerPreview = Boolean(markerDragSnapshots?.length)
    const displaySnapshots = hasMarkerPreview ? markerDragSnapshots! : snapshots
    const hasMain = displaySnapshots.length > 0
    const hasPrev =
      !hasMarkerPreview && previewSnapshots !== null && previewSnapshots.length > 0
    if (!hasMain && !hasPrev) return

    const { top, right, bottom, left } = GRAPH_MARGIN
    const innerW = width - left - right
    const innerH = height - top - bottom
    if (innerW <= 0 || innerH <= 0) return

    assetStackGeomRef.current = null

    const useReal = graphSettings.showRealValues

    const invDraft = draggingDraft
    const useInvStartSplit =
      Boolean(
        isDragging &&
          invDraft?.kind === 'investment' &&
          dragPreviewMonth !== null &&
          previewSnapshots &&
          previewBaselineSnapshots &&
          previewSnapshots.length === previewBaselineSnapshots.length &&
          (invDraft.initialAmount > 0 || invDraft.monthlyContribution > 0),
      )
    const invStartMonth =
      useInvStartSplit && previewSnapshots && dragPreviewMonth !== null
        ? Math.min(Math.max(0, dragPreviewMonth), previewSnapshots.length - 1)
        : 0

    const xLen = Math.max(displaySnapshots.length, previewSnapshots?.length ?? 0, 2)
    const xMax = Math.max(1, xLen - 1)
    const xDomain = effectiveXDomain(xMax, graphSettings.zoomRange)
    const xLo = xDomain[0]
    const xHi = xDomain[1]
    const xScale = d3.scaleLinear().domain([xDomain[0], xDomain[1]]).range([0, innerW])

    // Y-domain must match the visible x-window, otherwise Y never changes when zooming.
    const mainVals = hasMain ? displaySnapshots.slice(xLo, xHi + 1).map((d) => pickYValue(d, useReal)) : []
    const mainDebtNegVals = hasMain
      ? displaySnapshots.slice(xLo, xHi + 1).map((d) => -totalLiabilitiesDisplay(d, useReal))
      : []
    const prevVals = hasPrev ? previewSnapshots!.slice(xLo, xHi + 1).map((d) => pickYValue(d, useReal)) : []
    const prevDebtNegVals = hasPrev
      ? previewSnapshots!.slice(xLo, xHi + 1).map((d) => -totalLiabilitiesDisplay(d, useReal))
      : []
    const stressVals =
      graphSettings.stressTestActive && stressSnapshots && stressSnapshots.length > 0
        ? stressSnapshots.slice(xLo, xHi + 1).map((d) => pickYValue(d, useReal))
        : []
    const stressDebtNegVals =
      graphSettings.stressTestActive && stressSnapshots && stressSnapshots.length > 0
        ? stressSnapshots.slice(xLo, xHi + 1).map((d) => -totalLiabilitiesDisplay(d, useReal))
        : []
    const ghostVals =
      ghostSnapshots && ghostSnapshots.length > 0 ? ghostSnapshots.slice(xLo, xHi + 1).map((d) => pickYValue(d, useReal)) : []
    const ghostDebtNegVals =
      ghostSnapshots && ghostSnapshots.length > 0
        ? ghostSnapshots.slice(xLo, xHi + 1).map((d) => -totalLiabilitiesDisplay(d, useReal))
        : []
    const values = [
      ...mainVals,
      ...mainDebtNegVals,
      ...prevVals,
      ...prevDebtNegVals,
      ...stressVals,
      ...stressDebtNegVals,
      ...ghostVals,
      ...ghostDebtNegVals,
    ]
    const yMin = Math.min(0, d3.min(values) ?? 0)
    const yMax = Math.max(0, d3.max(values) ?? 0)
    const yPad = (yMax - yMin) * 0.08 || 1
    const hMain = innerH
    const yScale = d3
      .scaleLinear()
      .domain([yMin - yPad, yMax + yPad])
      .nice()
      .range([hMain, 0])

    const hoverSeries: MonthSnapshot[] = hasMain ? displaySnapshots : previewSnapshots!
    const svg = d3.select(el)
    milestoneDomRefreshRef.current = true
    try {
      svg.selectAll('*').remove()
      svg
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('width', width)
        .attr('height', height)
        .style('cursor', 'crosshair')

      const defs = svg.append('defs')

    const gradPreviewId = 'nw-area-preview-grad'
    const lgP = defs
      .append('linearGradient')
      .attr('id', gradPreviewId)
      .attr('x1', '0')
      .attr('y1', '0')
      .attr('x2', '0')
      .attr('y2', '1')
    lgP.append('stop').attr('offset', '0%').attr('stop-color', '#fbbf24').attr('stop-opacity', 0.28)
    lgP.append('stop').attr('offset', '100%').attr('stop-color', '#fbbf24').attr('stop-opacity', 0)

    defs
      .append('clipPath')
      .attr('id', 'nw-plot-clip')
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', innerW)
      .attr('height', innerH)

    const root = svg.append('g').attr('transform', `translate(${left},${top})`)
    const plotClip = root
      .append('g')
      .attr('class', 'nw-plot-clip-layer')
      .attr('clip-path', 'url(#nw-plot-clip)')

    drawGrid(plotClip, xScale, yScale, innerW, innerH)
    drawZeroLine(plotClip, yScale, innerW, innerH)

    if (hasMain) {
      const gapG = plotClip.append('g').attr('class', 'nw-income-gap').attr('pointer-events', 'none')
      const xDomSpan = Math.max(1, xDomain[1] - xDomain[0])
      const xStep = innerW / xDomSpan
      for (let i = 0; i < displaySnapshots.length; i++) {
        if (displaySnapshots[i]!.grossIncome !== 0) continue
        const x0 = xScale(i) - xStep * 0.5
        gapG
          .append('rect')
          .attr('x', x0)
          .attr('y', 0)
          .attr('width', Math.max(1, xStep))
          .attr('height', hMain)
          .attr('fill', 'rgba(244, 63, 94, 0.07)')
      }
    }

    if (hasMain) {
      const invIdsOrdered = investmentIdsOrderedForAssetStack(displaySnapshots, eventsForMarkers)
      const splitInv = graphSettings.showAssetBreakdown && invIdsOrdered.length > 0
      const stackKeys = assetStackRowKeys(splitInv, invIdsOrdered)
      const assetRows = buildAssetStackRowsForChart(
        displaySnapshots,
        useReal,
        splitInv,
        invIdsOrdered,
      )
      const stackAst = d3.stack<Record<string, number>>().keys(stackKeys)(assetRows)
      const areaAst = d3
        .area<d3.SeriesPoint<Record<string, number>>>()
        .x((_, i) => xScale(i))
        .y0((d) => yScale(d[0]))
        .y1((d) => yScale(d[1]))
        .curve(d3.curveMonotoneX)
      const fillOp = graphSettings.showAssetBreakdown ? 0.3 : 0.22
      const fillOpStr = String(fillOp)

      function stackLayerColor(stackKey: string): string {
        if (stackKey === 'cash') return graphAssetAreaColors.cash
        if (stackKey === 'poolPos') return graphAssetAreaColors.savingsPool
        if (stackKey === 'poolNeg') return graphAssetAreaColors.savingsPoolNegative
        if (stackKey === 'phys') return graphAssetAreaColors.physical
        if (stackKey === 'inv') return graphAssetAreaColors.investments
        if (stackKey.startsWith(ASSET_STACK_INV_PREFIX)) {
          const id = stackKey.slice(ASSET_STACK_INV_PREFIX.length)
          const idx = invIdsOrdered.indexOf(id)
          if (idx >= 0) {
            return investmentRibbonFill(
              eventTypeColors.investment,
              idx,
              invIdsOrdered.length,
            )
          }
          return graphAssetAreaColors.investments
        }
        return '#64748b'
      }

      const debtBelow = displaySnapshots.map((d) => ({
        y0: 0,
        y1: -totalLiabilitiesDisplay(d, useReal),
      }))
      const hasDebtBelow = debtBelow.some(({ y1 }) => y1 < -1e-6)
      if (hasDebtBelow) {
        const areaDebt = d3
          .area<{ y0: number; y1: number }>()
          .x((_, i) => xScale(i))
          .y0((d) => yScale(d.y0))
          .y1((d) => yScale(d.y1))
          .curve(d3.curveMonotoneX)
        plotClip
          .append('path')
          .datum(debtBelow)
          .attr('class', 'nw-debt-below-zero')
          .attr('fill', graphAssetAreaColors.debt)
          .attr('fill-opacity', 0.42)
          .attr('pointer-events', 'none')
          .attr('d', areaDebt as unknown as string)
      }

      assetStackGeomRef.current = {
        innerW,
        innerH,
        xScale,
        yScale,
        monthCount: displaySnapshots.length,
        stack: stackAst,
      }

      const fillG = plotClip
        .append('g')
        .attr('class', 'nw-asset-stack')
        .attr('data-testid', 'nw-asset-stack')
        .attr('pointer-events', 'none')
      stackAst.forEach((layer) => {
        const sk = String(layer.key)
        fillG
          .append('path')
          .datum(layer)
          .attr('class', 'nw-asset-stack-layer')
          .attr('data-stack-key', sk)
          .attr('data-base-opacity', fillOpStr)
          .attr('fill', stackLayerColor(sk))
          .attr('fill-opacity', fillOp)
          .attr('d', areaAst as unknown as string)
      })

      if (
        ghostSnapshots &&
        ghostSnapshots.length > 0 &&
        ghostSnapshots.length === displaySnapshots.length
      ) {
        const lineGhost = d3
          .line<MonthSnapshot>()
          .x((_, i) => xScale(i))
          .y((d) => yScale(pickYValue(d, useReal)))
          .curve(d3.curveMonotoneX)
        plotClip
          .append('path')
          .datum(ghostSnapshots)
          .attr('class', 'nw-ghost-line')
          .attr('fill', 'none')
          .attr('stroke', 'rgba(148, 163, 184, 0.55)')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '6 5')
          .attr('pointer-events', 'none')
          .attr('d', lineGhost)
      }

      if (
        graphSettings.stressTestActive &&
        stressSnapshots &&
        stressSnapshots.length > 0 &&
        stressSnapshots.length === displaySnapshots.length
      ) {
        const lineStress = d3
          .line<MonthSnapshot>()
          .x((_, i) => xScale(i))
          .y((d) => yScale(pickYValue(d, useReal)))
          .curve(d3.curveMonotoneX)
        plotClip
          .append('path')
          .datum(stressSnapshots)
          .attr('class', 'nw-stress-line')
          .attr('fill', 'none')
          .attr('stroke', 'rgba(167, 139, 250, 0.92)')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5 5')
          .attr('pointer-events', 'none')
          .attr('d', lineStress)
      }

      const line = d3
        .line<MonthSnapshot>()
        .x((_, i) => xScale(i))
        .y((d) => yScale(pickYValue(d, useReal)))
        .curve(d3.curveMonotoneX)

      plotClip
        .append('path')
        .datum(displaySnapshots)
        .attr('fill', 'none')
        .attr('stroke', accent.line)
        .attr('stroke-width', 2.5)
        .attr('filter', `drop-shadow(0 0 8px ${accent.glow})`)
        .attr('d', line)
    } else if (hasPrev) {
      const compositeAreaYs =
        useInvStartSplit && invStartMonth > 0
          ? previewSnapshots!.map((_, i) =>
              i < invStartMonth
                ? pickYValue(previewBaselineSnapshots![i]!, useReal)
                : pickYValue(previewSnapshots![i]!, useReal),
            )
          : previewSnapshots!.map((d) => pickYValue(d, useReal))
      const areaPrev = d3
        .area<number>()
        .x((_, i) => xScale(i))
        .y0(hMain)
        .y1((y) => yScale(y))
        .curve(d3.curveMonotoneX)
      plotClip
        .append('path')
        .datum(compositeAreaYs)
        .attr('fill', `url(#${gradPreviewId})`)
        .attr('d', areaPrev)
    }

    if (hasPrev && previewSnapshots) {
      const amberAttrs = {
        fill: 'none' as const,
        stroke: '#fbbf24',
        strokeWidth: 2.75,
        strokeDasharray: '8 5',
        strokeLinecap: 'round' as const,
        opacity: hasMain ? 0.92 : 1,
        filter: 'drop-shadow(0 0 10px rgba(251,191,36,0.35))',
      }

      if (useInvStartSplit && invStartMonth > 0 && hasMain) {
        const postY = previewSnapshots
          .slice(invStartMonth)
          .map((d) => pickYValue(d, useReal))
        const linePost = d3
          .line<number>()
          .x((_, i) => xScale(i + invStartMonth))
          .y((y) => yScale(y))
          .curve(d3.curveMonotoneX)
        plotClip
          .append('path')
          .datum(postY)
          .attr('fill', amberAttrs.fill)
          .attr('stroke', amberAttrs.stroke)
          .attr('stroke-width', amberAttrs.strokeWidth)
          .attr('stroke-dasharray', amberAttrs.strokeDasharray)
          .attr('stroke-linecap', amberAttrs.strokeLinecap)
          .attr('opacity', amberAttrs.opacity)
          .attr('filter', amberAttrs.filter)
          .attr('d', linePost)
      } else if (useInvStartSplit && invStartMonth > 0 && !hasMain) {
        const preY = previewBaselineSnapshots!
          .slice(0, invStartMonth)
          .map((d) => pickYValue(d, useReal))
        const linePre = d3
          .line<number>()
          .x((_, i) => xScale(i))
          .y((y) => yScale(y))
          .curve(d3.curveMonotoneX)
        plotClip
          .append('path')
          .datum(preY)
          .attr('fill', 'none')
          .attr('stroke', 'rgba(148, 163, 184, 0.65)')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5 6')
          .attr('stroke-linecap', 'round')
          .attr('opacity', 0.9)
          .attr('d', linePre)

        const postY = previewSnapshots
          .slice(invStartMonth)
          .map((d) => pickYValue(d, useReal))
        const linePost = d3
          .line<number>()
          .x((_, i) => xScale(i + invStartMonth))
          .y((y) => yScale(y))
          .curve(d3.curveMonotoneX)
        plotClip
          .append('path')
          .datum(postY)
          .attr('fill', amberAttrs.fill)
          .attr('stroke', amberAttrs.stroke)
          .attr('stroke-width', amberAttrs.strokeWidth)
          .attr('stroke-dasharray', amberAttrs.strokeDasharray)
          .attr('stroke-linecap', amberAttrs.strokeLinecap)
          .attr('opacity', 1)
          .attr('filter', amberAttrs.filter)
          .attr('d', linePost)
      } else {
        const linePrev = d3
          .line<MonthSnapshot>()
          .x((_, i) => xScale(i))
          .y((d) => yScale(pickYValue(d, useReal)))
          .curve(d3.curveMonotoneX)
        plotClip
          .append('path')
          .datum(previewSnapshots)
          .attr('fill', amberAttrs.fill)
          .attr('stroke', amberAttrs.stroke)
          .attr('stroke-width', amberAttrs.strokeWidth)
          .attr('stroke-dasharray', amberAttrs.strokeDasharray)
          .attr('stroke-linecap', amberAttrs.strokeLinecap)
          .attr('opacity', amberAttrs.opacity)
          .attr('filter', amberAttrs.filter)
          .attr('d', linePrev)
      }
    }

    if (graphSettings.showLinearReference && hasMain) {
      const linPts = buildLinearReferencePoints(displaySnapshots, useReal)
      const ln = d3
        .line<{ x: number; y: number }>()
        .x((d) => xScale(d.x))
        .y((d) => yScale(d.y))
      plotClip
        .append('path')
        .datum(linPts)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(248, 250, 252, 0.25)')
        .attr('stroke-dasharray', '6 4')
        .attr('stroke-width', 1.5)
        .attr('d', ln)
    }

    const milestonePad = 3
    const milestoneLabelTop = 10
    const milestoneLineTop = 22
    const lang = appLang
    const segFlat = buildMilestoneSegFlat(milestonesForGraph, xMax, useReal)

    const milestoneBaseParams = {
      segFlat,
      innerW,
      innerH,
      xScale,
      milestonePad,
      milestoneLabelTop,
      milestoneLineTop,
      lang,
      currency,
      t,
      cancelMilestoneHoverClear,
      scheduleMilestoneHoverClear,
      setMilestoneHoverKey,
      useRealDollars: useReal,
      suppressHoverLeave: () => milestoneDomRefreshRef.current,
    }
    const chipLayer = plotClip.append('g').attr('class', 'nw-milestone-chip-layer')
    drawMilestoneVlinesAndPlotLabels(chipLayer, {
      ...milestoneBaseParams,
      milestoneHoverKey,
      milestonePinnedKey,
    })

    const simulationStartDate =
      displaySnapshots[0]?.date ?? previewSnapshots?.[0]?.date ?? new Date()
    const fmtSimMonthAxis = (m: number) =>
      formatSimulationMonthShort(simulationStartDate, m, lang)

    const visibleSpanMonths = Math.max(1, xDomain[1] - xDomain[0] + 1)
    const isYearTransitionMonth = (m: number) => {
      if (m <= 0) return true
      const y = calendarYearForSimulationMonth(simulationStartDate, m)
      const yPrev = calendarYearForSimulationMonth(simulationStartDate, m - 1)
      return y !== yPrev
    }
    // Axis density modes:
    // - month-by-month for very small spans (only if there's enough pixels per month)
    // - otherwise show a middle mixed scale: years + 3-month (quarter) ticks
    const showMonthByMonthTicks =
      visibleSpanMonths <= 24 && innerW / Math.max(1, visibleSpanMonths) >= 18
    const showQuarterTicks = !showMonthByMonthTicks && visibleSpanMonths <= 72
    /** Matches `xAxisMonthTicks` when `totalMonths > 240`: majors every 60 months (5 simulation years). */
    const useFiveYearMajorTicks = xLen > 241 && !showMonthByMonthTicks && !showQuarterTicks

    let tickValuesFiltered: number[] = []
    let yearTickMonthsFiltered: number[] = []
    let tickFormatFn: (d: number) => string = fmtSimMonthAxis

    if (showMonthByMonthTicks) {
      const base = xDomain[0]
      tickValuesFiltered = Array.from({ length: visibleSpanMonths }, (_, i) => base + i)

      // Single-row mixed labeling:
      // - show calendar year at month 12 boundaries (M12, M24, ...)
      // - otherwise show the month index
      yearTickMonthsFiltered = []
      tickFormatFn = (d) =>
        isYearTransitionMonth(d)
          ? t('axis.calendarYear', {
              year: calendarYearForSimulationMonth(simulationStartDate, d),
            })
          : fmtSimMonthAxis(d)
    } else if (showQuarterTicks) {
      const base = xDomain[0]
      const end = xDomain[1]
      const ticks: number[] = []
      for (let m = base; m <= end; m += 3) ticks.push(m)
      if (ticks.length === 0 || ticks[ticks.length - 1] !== end) ticks.push(end)
      // Ensure actual calendar year transition months are included as ticks.
      for (let m = base; m <= end; m++) {
        if (isYearTransitionMonth(m)) ticks.push(m)
      }
      const uniq = Array.from(new Set(ticks)).sort((a, b) => a - b)
      tickValuesFiltered = filterTickValuesToVisibleDomain(uniq, xDomain[0], xDomain[1])

      yearTickMonthsFiltered = []
      tickFormatFn = (d) =>
        isYearTransitionMonth(d)
          ? t('axis.calendarYear', {
              year: calendarYearForSimulationMonth(simulationStartDate, d),
            })
          : fmtSimMonthAxis(d)
    } else {
      const { tickValues, format } = xAxisMonthTicks(
        xLen,
        fmtSimMonthAxis,
        (y) => t('axis.year', { n: y }),
        {
          simulationStart: simulationStartDate,
          formatCalendarYear: (y) => t('axis.calendarYear', { year: y }),
        },
      )
      tickValuesFiltered = filterTickValuesToVisibleDomain(tickValues, xDomain[0], xDomain[1])
      // Suppress the separate year-row to avoid double labels.
      yearTickMonthsFiltered = []
      tickFormatFn = (d) =>
        isYearTransitionMonth(d)
          ? t('axis.calendarYear', {
              year: calendarYearForSimulationMonth(simulationStartDate, d),
            })
          : format(Number(d))
    }

    // Ensure we always have explicit tick marks at real calendar year transitions.
    // This avoids cases where the mixed/quarter tick spacing skips M12 (or equivalents).
    if (visibleSpanMonths <= 240) {
      const yearTicks: number[] = []
      for (let m = xDomain[0]; m <= xDomain[1]; m++) {
        if (isYearTransitionMonth(m)) yearTicks.push(m)
      }
      const uniq = Array.from(new Set([...tickValuesFiltered, ...yearTicks])).sort((a, b) => a - b)
      tickValuesFiltered = uniq
    }

    const majorTickSet = new Set(tickValuesFiltered)
    /** Annual marks on the same month index scale as majors (0, 60, 120…); calendar-year boundaries would sit on different indices and misalign. */
    const minorYearTickMonths: number[] = []
    if (useFiveYearMajorTicks) {
      for (let m = xDomain[0]; m <= xDomain[1]; m++) {
        if (m % 12 !== 0) continue
        if (m % 60 === 0) continue
        if (majorTickSet.has(m)) continue
        minorYearTickMonths.push(m)
      }
    }

    if (minorYearTickMonths.length > 0) {
      root
        .append('g')
        .attr('class', 'nw-x-axis-minor-ticks')
        .attr('transform', `translate(0,${innerH})`)
        .attr('pointer-events', 'none')
        .selectAll('line')
        .data(minorYearTickMonths)
        .join('line')
        .attr('x1', (d) => xScale(d))
        .attr('x2', (d) => xScale(d))
        .attr('y1', 0)
        .attr('y2', 5)
        .attr('stroke', '#64748b')
        .attr('stroke-opacity', 0.55)
    }

    const xa = root
      .append('g')
      .attr('class', 'nw-main-x-axis')
      .attr('transform', `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(xScale)
          .tickValues(tickValuesFiltered)
          .tickFormat((d) => tickFormatFn(Number(d))),
      )
    xa.selectAll('text').attr('fill', '#94a3b8').attr('font-size', 10).attr('class', 'tabular-nums')
    xa.selectAll('path,line').attr('stroke', '#475569')

    if (yearTickMonthsFiltered.length > 0) {
      root
        .append('g')
        .attr('class', 'nw-x-axis-calendar-years')
        .attr('transform', `translate(0,${innerH + 16})`)
        .attr('pointer-events', 'none')
        .selectAll('text')
        .data(yearTickMonthsFiltered)
        .join('text')
        .attr('x', (m) => xScale(m))
        .attr('y', 0)
        .attr('text-anchor', 'middle')
        .attr('fill', '#64748b')
        .attr('font-size', 9)
        .attr('class', 'tabular-nums')
        .text((m) =>
          t('axis.calendarYear', {
            year: calendarYearForSimulationMonth(simulationStartDate, m),
          }),
        )
    }

    graphMilestoneContextRef.current = {
      innerW,
      innerH,
      xLen,
      xScale,
      segFlat,
      useRealDollars: useReal,
      milestonePad,
      milestoneLabelTop,
      milestoneLineTop,
      lang,
      currency,
      t,
      cancelMilestoneHoverClear,
      scheduleMilestoneHoverClear,
      setMilestoneHoverKey,
    }

    const ya = root.append('g').attr('class', 'nw-y-axis').call(
      d3
        .axisLeft(yScale)
        .ticks(6)
        .tickFormat((d) => axisMoney(Number(d), t)),
    )
    ya.selectAll('text').attr('fill', '#94a3b8').attr('font-size', 10).attr('class', 'tabular-nums')
    ya.selectAll('path,line').attr('stroke', '#475569')

    /** Map to inner-plot (0…innerW × 0…innerH). Use the SVG element — pointer on a transformed `<g>` can mis-read Y when the SVG is CSS-scaled. */
    const pointerInner = (ev: MouseEvent) => {
      const [px, py] = d3.pointer(ev, el)
      return [px - left, py - top] as const
    }

    const rootNode = root.node()
    if (!rootNode) return

    /** Month/series the last hover state was computed for (persists across mousemove). */
    let lastHoverIdx = -1
    let lastCrosshair: { left: number; width: number } | null = null

    const onMove = (ev: Event) => {
      const mev = ev as MouseEvent
      const [mx, my] = pointerInner(mev)
      const insidePlot = mx >= 0 && mx <= innerW && my >= 0 && my <= innerH
      const insideMonthAxis = mx >= 0 && mx <= innerW && my >= 0 && my <= innerH + X_AXIS_BRUSH_BELOW_PX
      const pin = pinnedMonthRef.current

      const ag = assetStackGeomRef.current
      let nextStackHover: string | null = null
      const brushDragging = isXBrushDraggingRef.current
      if (brushDragging) {
        setInvestmentStackHoverSlice(null)
        return
      }

      const n = hoverSeries.length
      if (insidePlot && ag && hasMain) {
        nextStackHover = pickAssetStackLayer(mx, my, ag)
      }
      if (nextStackHover !== assetStackHoverKeyRef.current) {
        assetStackHoverKeyRef.current = nextStackHover
        applyAssetStackHover(el, nextStackHover)
      }

      if (graphSettings.showAssetBreakdown && insidePlot && nextStackHover?.startsWith(ASSET_STACK_INV_PREFIX)) {
        const monthIdxForSlice =
          pin !== null
            ? pin
            : Math.max(0, Math.min(n - 1, Math.round(xScale.invert(mx))))
        const snap = hoverSeries[monthIdxForSlice]
        if (snap) {
          const id = nextStackHover.slice(ASSET_STACK_INV_PREFIX.length)
          const k = snapshotInflationScale(snap, useReal)
          const amount = (snap.investmentAssetsByEventId[id] ?? 0) * k
          const ev = eventsForMarkers.find((e) => e.id === id)
          setInvestmentStackHoverSlice({
            eventId: id,
            name: ev?.name ?? id,
            amount,
          })
        } else {
          setInvestmentStackHoverSlice(null)
        }
      } else {
        setInvestmentStackHoverSlice(null)
      }

      if (insideMonthAxis) {
        const i =
          pin !== null
            ? pin
            : Math.max(0, Math.min(n - 1, Math.round(xScale.invert(mx))))
        const band = monthColumnBandInner(i, n, innerW, xScale)
        if (!lastCrosshair || lastCrosshair.left !== band.left || lastCrosshair.width !== band.width) {
          lastCrosshair = band
          setPlotCrosshairBand(band)
        }
      } else if (pin !== null) {
        const band = monthColumnBandInner(pin, n, innerW, xScale)
        if (!lastCrosshair || lastCrosshair.left !== band.left || lastCrosshair.width !== band.width) {
          lastCrosshair = band
          setPlotCrosshairBand(band)
        }
      } else if (lastCrosshair !== null) {
        lastCrosshair = null
        setPlotCrosshairBand(null)
      }

      // Hover boost for the “debt below zero” fill (liabilities that drive net-worth negative).
      if (insidePlot) {
        const idx = pin !== null ? pin : Math.max(0, Math.min(n - 1, Math.round(xScale.invert(mx))))
        const snap = hoverSeries[idx]
        const liab = snap ? totalLiabilitiesDisplay(snap, useReal) : 0
        const hoveringDebt = liab > 1e-6 && (() => {
          const y0 = yScale(0)
          const y1 = yScale(-liab)
          const loY = Math.min(y0, y1)
          const hiY = Math.max(y0, y1)
          return my >= loY && my <= hiY
        })()
        if (hoveringDebt !== debtHoverActiveRef.current) {
          debtHoverActiveRef.current = hoveringDebt
          applyDebtHover(el, hoveringDebt)
        }
      } else if (debtHoverActiveRef.current) {
        debtHoverActiveRef.current = false
        applyDebtHover(el, false)
      }

      if (!insidePlot) return
      /** After the click-vs-drag threshold, marker drag owns the tooltip month — ignore plot X until release. */
      if (markerDragRef.current !== null && markerDragBeyondThresholdRef.current) return
      if (pin !== null) return
      const idx = Math.round(xScale.invert(mx))
      const i = Math.max(0, Math.min(hoverSeries.length - 1, idx))
      if (i !== lastHoverIdx) {
        lastHoverIdx = i
        const next = hoverStateForMonth(hoverSeries, i, eventsForMarkers, useReal, t)
        if (next) setHover(next)
      }
    }

    const onClick = (ev: MouseEvent) => {
      if (suppressPlotClickRef.current) return
      const tgt = ev.target as Element | null
      if (tgt?.closest?.('[data-nw-graph-marker]')) return
      const [mx, my] = pointerInner(ev)
      if (mx < 0 || mx > innerW || my < 0 || my > innerH) return

      const ag = assetStackGeomRef.current
      const layer =
        hasMain && ag ? pickAssetStackLayer(mx, my, ag) : null
      if (layer === 'inv' || (layer?.startsWith(ASSET_STACK_INV_PREFIX) ?? false)) {
        const breakdownOn = useAppStore.getState().graphSettings.showAssetBreakdown
        patchGraphSettings({ showAssetBreakdown: !breakdownOn })
        return
      }

      const idx = Math.round(xScale.invert(mx))
      const i = Math.max(0, Math.min(hoverSeries.length - 1, idx))
      const next = hoverStateForMonth(hoverSeries, i, eventsForMarkers, useReal, t)
      if (!next) return
      onGraphPlotClick?.()
      const pinMonth = useAppStore.getState().graphPinnedMonth
      useAppStore.getState().setGraphPinnedMonth(pinMonth !== null ? null : i)
      setHover(next)
    }

    // The zoom brush strip is an HTML element above the SVG.
    // Attach pointer tracking to the outer plot container so crosshair month highlighting works there too.
    const moveTarget = plotRef.current ?? el
    moveTarget.addEventListener('mousemove', onMove, { capture: true })
    el.addEventListener('click', onClick, { capture: true })

    if (graphSettings.showMonteCarlo) {
      plotClip
        .append('text')
        .attr('x', innerW / 2)
        .attr('y', 14)
        .attr('text-anchor', 'middle')
        .attr('fill', '#64748b')
        .attr('font-size', 11)
        .text(t('graph.monteCarloPlaceholder'))
    }

    applyAssetStackHover(el, assetStackHoverKeyRef.current)

    return () => {
      xBrushSessionRef.current = null
      isXBrushDraggingRef.current = false
      setXBrushOverlayPx(null)
      setXBrushSelectedMonths(null)
      moveTarget.removeEventListener('mousemove', onMove, { capture: true })
      el.removeEventListener('click', onClick, { capture: true })
      graphMilestoneContextRef.current = null
      cancelMilestoneHoverClear()
      setMilestoneHoverKey(null)
      setMilestonePinnedKey(null)
    }
    } finally {
      queueMicrotask(() => {
        milestoneDomRefreshRef.current = false
      })
    }
  }, [
    width,
    height,
    snapshots,
    markerDragSnapshots,
    previewSnapshots,
    previewBaselineSnapshots,
    events,
    eventsForMarkers,
    milestonesForGraph,
    cancelMilestoneHoverClear,
    scheduleMilestoneHoverClear,
    graphSettings.showRealValues,
    graphSettings.showLinearReference,
    graphSettings.showMonteCarlo,
    graphSettings.showAssetBreakdown,
    graphSettings.stressTestActive,
    graphSettings.zoomRange,
    stressSnapshots,
    ghostSnapshots,
    currency,
    t,
    appLang,
    graphPinnedMonth,
    setGraphPinnedMonth,
    isDragging,
    draggingDraft,
    dragPreviewMonth,
    onGraphPlotClick,
    patchGraphSettings,
  ])

  useLayoutEffect(() => {
    const el = svgRef.current
    const ctx = graphMilestoneContextRef.current
    if (!el || !ctx) return

    const svg = d3.select(el)
    const root = svg.select('g')
    if (root.empty()) return
    const plotClipLayer = root.select('.nw-plot-clip-layer')
    if (plotClipLayer.empty()) return

    const {
      innerW,
      innerH,
      segFlat,
      useRealDollars,
      milestonePad,
      milestoneLabelTop,
      milestoneLineTop,
      lang,
      currency,
      t,
      cancelMilestoneHoverClear,
      scheduleMilestoneHoverClear,
      setMilestoneHoverKey,
      xScale,
    } = ctx

    const milestoneBaseParams = {
      segFlat,
      innerW,
      innerH,
      xScale,
      milestonePad,
      milestoneLabelTop,
      milestoneLineTop,
      lang,
      currency,
      t,
      cancelMilestoneHoverClear,
      scheduleMilestoneHoverClear,
      setMilestoneHoverKey,
      useRealDollars,
      suppressHoverLeave: () => milestoneDomRefreshRef.current,
    }

    milestoneDomRefreshRef.current = true
    try {
      plotClipLayer.select('.nw-milestone-chip-layer').remove()
      plotClipLayer.select('.nw-milestone-x-axis').remove()

      const chipLayer = plotClipLayer.append('g').attr('class', 'nw-milestone-chip-layer')
      drawMilestoneVlinesAndPlotLabels(chipLayer, {
        ...milestoneBaseParams,
        milestoneHoverKey,
        milestonePinnedKey,
      })
    } finally {
      queueMicrotask(() => {
        milestoneDomRefreshRef.current = false
      })
    }
  }, [milestoneHoverKey, milestonePinnedKey])

  const n = Math.max(
    snapshots.length,
    markerDragSnapshots?.length ?? 0,
    previewSnapshots?.length ?? 0,
    2,
  )
  const showDragLine =
    isDragging &&
    dragPreviewMonth !== null &&
    n > 1 &&
    dragPreviewMonth >= 0 &&
    dragPreviewMonth <= n - 1

  let dragLineX: number | null = null
  if (showDragLine && plotGeometry) {
    dragLineX = plotGeometry.left + plotGeometry.xScale(dragPreviewMonth!)
  } else if (showDragLine && width > GRAPH_MARGIN.left + GRAPH_MARGIN.right) {
    const innerW = width - GRAPH_MARGIN.left - GRAPH_MARGIN.right
    const frac = dragPreviewMonth! / Math.max(1, n - 1)
    dragLineX = GRAPH_MARGIN.left + frac * innerW
  }

  const markerRepositionLineX =
    markerDrag && plotGeometry
      ? plotGeometry.left + plotGeometry.xScale(markerDrag.previewMonth)
      : null

  /**
   * X-axis brush lives in an HTML layer (above the SVG, below marker hit targets) so pointer events
   * are not swallowed by stacking; math uses inner-plot X and the current visible `xDomain`.
   */
  const finishXBrushPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
      const sess = xBrushSessionRef.current
      if (!sess || e.pointerId !== sess.pointerId) return
      xBrushSessionRef.current = null
      isXBrushDraggingRef.current = false
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* not captured */
      }
      setXBrushOverlayPx(null)
      setXBrushSelectedMonths(null)
      xBrushSelectedMonthsRef.current = null
      setPlotCrosshairBand(null)
      if (cancelled) return

      const pg = plotGeometryRef.current
      const plot = plotRef.current
      if (!pg || !plot) return
      const innerX1 = clientXToInnerPlotX(
        e.clientX,
        plot.getBoundingClientRect(),
        GRAPH_MARGIN.left,
        GRAPH_MARGIN.right,
      )

      // Ignore tiny drags before we even attempt to snap to discrete month indices.
      if (Math.abs(innerX1 - sess.innerX0) < X_BRUSH_DRAG_THRESHOLD_PX) return

      const rect = plot.getBoundingClientRect()
      const totalMonths = pg.xMax + 1
      const month1 = clientXToMonthIndexInDomain(
        e.clientX,
        rect,
        totalMonths,
        GRAPH_MARGIN.left,
        GRAPH_MARGIN.right,
        pg.xDomain,
      )
      const lo = Math.min(sess.month0, month1)
      const hi = Math.max(sess.month0, month1)
      const next = domainFromBrushMonths(lo, hi, pg.xMax)
      if (!next) return

      const st = useAppStore.getState()
      const prev = effectiveXDomain(pg.xMax, st.graphSettings.zoomRange)
      if (prev[0] === next[0] && prev[1] === next[1]) return
      setXZoomHistory((h) => [...h, [prev[0], prev[1]]])
      patchGraphSettings({ zoomRange: [next[0], next[1]] })
      suppressPlotClickRef.current = true
      requestAnimationFrame(() => {
        suppressPlotClickRef.current = false
      })
    },
    [patchGraphSettings],
  )

  const onXBrushPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // `e.button` is reliable for mouse, but can be ambiguous for touch/pen.
    // Only enforce "primary button" for mouse pointers.
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const plot = plotRef.current
    const pg = plotGeometryRef.current
    if (!plot || !pg) return
    const innerX0 = clientXToInnerPlotX(
      e.clientX,
      plot.getBoundingClientRect(),
      GRAPH_MARGIN.left,
      GRAPH_MARGIN.right,
    )

    const rect = plot.getBoundingClientRect()
    const totalMonths = pg.xMax + 1
    const month0 = clientXToMonthIndexInDomain(
      e.clientX,
      rect,
      totalMonths,
      GRAPH_MARGIN.left,
      GRAPH_MARGIN.right,
      pg.xDomain,
    )

    xBrushSessionRef.current = { pointerId: e.pointerId, innerX0, month0 }
    isXBrushDraggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)

    const n = pg.series.length
    const a = monthColumnBandInner(month0, n, pg.innerW, pg.xScale)
    const left = Math.max(0, Math.min(pg.innerW, a.left))
    const right = Math.max(0, Math.min(pg.innerW, a.left + a.width))
    setXBrushOverlayPx([left, right])
    setXBrushSelectedMonths([month0, month0])
    xBrushSelectedMonthsRef.current = [month0, month0]

    // Extend the discrete crosshair highlight to the selected month range.
    const leftBand = left
    const widthBand = Math.max(0, right - leftBand)
    setPlotCrosshairBand({ left: leftBand, width: widthBand })
  }, [])

  const onXBrushPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const sess = xBrushSessionRef.current
    if (!sess || e.pointerId !== sess.pointerId) return
    const plot = plotRef.current
    const pg = plotGeometryRef.current
    if (!plot || !pg) return

    const rect = plot.getBoundingClientRect()
    const totalMonths = pg.xMax + 1
    const month1 = clientXToMonthIndexInDomain(
      e.clientX,
      rect,
      totalMonths,
      GRAPH_MARGIN.left,
      GRAPH_MARGIN.right,
      pg.xDomain,
    )
    const lo = Math.min(sess.month0, month1)
    const hi = Math.max(sess.month0, month1)

    const n = pg.series.length
    const a = monthColumnBandInner(lo, n, pg.innerW, pg.xScale)
    const b = monthColumnBandInner(hi, n, pg.innerW, pg.xScale)
    const left = Math.max(0, Math.min(pg.innerW, a.left))
    const right = Math.max(0, Math.min(pg.innerW, b.left + b.width))
    setXBrushOverlayPx([left, right])
    setXBrushSelectedMonths([lo, hi])
    xBrushSelectedMonthsRef.current = [lo, hi]

    // Extend the discrete crosshair highlight to the selected month range.
    const leftBand = Math.max(0, Math.min(pg.innerW, a.left))
    const rightBand = Math.max(0, Math.min(pg.innerW, b.left + b.width))
    setPlotCrosshairBand({ left: leftBand, width: Math.max(0, rightBand - leftBand) })
  }, [])

  const onXBrushPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      finishXBrushPointer(e, false)
    },
    [finishXBrushPointer],
  )

  const onXBrushPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      finishXBrushPointer(e, true)
    },
    [finishXBrushPointer],
  )

  const handleZoomBack = useCallback(() => {
    if (!plotGeometry) return
    const xMax = plotGeometry.xMax
    setXZoomHistory((hist) => {
      if (hist.length === 0) return hist
      const prev = hist[hist.length - 1]!
      patchGraphSettings({
        zoomRange: isFullXDomain(xMax, prev) ? null : [prev[0], prev[1]],
      })
      return hist.slice(0, -1)
    })
  }, [plotGeometry, patchGraphSettings])

  const handleZoomReset = useCallback(() => {
    setXZoomHistory([])
    patchGraphSettings({ zoomRange: null })
  }, [patchGraphSettings])

  /** Same series order as `hoverSeries` in the chart effect (for snapshot `date` on the tooltip). */
  const hoverSeriesForTooltipDate = useMemo(() => {
    const hasMarkerPreview = Boolean(markerDragSnapshots?.length)
    const displaySnapshots = hasMarkerPreview ? markerDragSnapshots! : snapshots
    const hasMain = displaySnapshots.length > 0
    const hasPrev =
      !hasMarkerPreview && previewSnapshots !== null && previewSnapshots.length > 0
    if (hasMain) return displaySnapshots
    if (hasPrev && previewSnapshots) return previewSnapshots
    return snapshots
  }, [markerDragSnapshots, snapshots, previewSnapshots])

  const xBrushSelectedLabel = useMemo(() => {
    if (!plotGeometry || !xBrushSelectedMonths) return null
    const [lo, hi] = xBrushSelectedMonths
    const s0 = plotGeometry.series[lo]
    const s1 = plotGeometry.series[hi]
    const simStart = plotGeometry.series[0]?.date ?? new Date()

    const m0 = formatSimulationMonthShort(simStart, lo, appLang)
    const m1 = formatSimulationMonthShort(simStart, hi, appLang)

    const locale = appLang === 'pt-BR' ? 'pt-BR' : 'en-US'
    const dtf = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short' })
    const d0 = s0 ? dtf.format(s0.date) : ''
    const d1 = s1 ? dtf.format(s1.date) : ''
    const dateLabel = d0 && d1 ? `${d0}–${d1}` : null

    return { monthLabel: `${m0}–${m1}`, dateLabel }
  }, [appLang, plotGeometry, xBrushSelectedMonths])

  return (
    <motion.div
      layout
      className="relative h-full min-h-0 w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950/80"
    >
      <div
        ref={plotRef}
        className="relative h-full min-h-0 w-full"
        onMouseLeave={() => {
          assetStackHoverKeyRef.current = null
          applyAssetStackHover(svgRef.current, null)
          setInvestmentStackHoverSlice(null)
          debtHoverActiveRef.current = false
          applyDebtHover(svgRef.current, false)
          if (graphPinnedMonth !== null && plotGeometry) {
            setPlotCrosshairBand(
              monthColumnBandInner(
                graphPinnedMonth,
                plotGeometry.series.length,
                plotGeometry.innerW,
                plotGeometry.xScale,
              ),
            )
          } else {
            setPlotCrosshairBand(null)
          }
          if (graphPinnedMonth === null) setHover(null)
        }}
      >
        <svg
          ref={svgRef}
          className="block h-full w-full"
          role="img"
          aria-label={
            stackInvestmentIdsOrdered.length > 0
              ? `${t('graph.ariaChart')}. ${t('graph.investmentStackClickHint')}`
              : t('graph.ariaChart')
          }
          data-testid="net-worth-chart"
        />
        {plotGeometry ? (
          <div
            role="presentation"
            data-testid="nw-x-brush-strip"
            className="absolute z-[10] cursor-ew-resize touch-none bg-slate-400/[0.07]"
            style={{
              left: plotGeometry.left,
              top: plotGeometry.top + plotGeometry.innerH - X_AXIS_BRUSH_BAND_PX,
              width: plotGeometry.innerW,
              // Extend below `innerH` to cover the x-axis tick label area.
              height: X_AXIS_BRUSH_BAND_PX + X_AXIS_BRUSH_BELOW_PX,
            }}
            aria-label={t('graph.xBrushBandTitle')}
            onPointerDown={onXBrushPointerDown}
            onPointerMove={onXBrushPointerMove}
            onPointerUp={onXBrushPointerUp}
            onPointerCancel={onXBrushPointerCancel}
          />
        ) : null}
        {plotGeometry && xBrushOverlayPx !== null && (
          <div
            data-testid="nw-x-brush-preview"
            className="pointer-events-none relative absolute z-[30]"
            style={{
              left: plotGeometry.left + xBrushOverlayPx[0],
              width: Math.max(0, xBrushOverlayPx[1] - xBrushOverlayPx[0]),
              // Render the preview directly over the HTML brush strip area so it’s always visible.
              top: plotGeometry.top + plotGeometry.innerH - X_AXIS_BRUSH_BAND_PX,
              height: X_AXIS_BRUSH_BAND_PX + X_AXIS_BRUSH_BELOW_PX,
            }}
            aria-hidden
          >
            {/* outline so the selection window is obvious */}
            <div
              className="absolute inset-0"
              style={{
                background: 'rgba(56, 189, 248, 0.18)',
                boxShadow: 'inset 0 0 0 2px rgba(56, 189, 248, 0.92)',
              }}
            />

            {/* discrete month columns (only when span is reasonably small) */}
            {xBrushSelectedMonths && plotGeometry && (() => {
              const [lo, hi] = xBrushSelectedMonths
              const span = Math.abs(hi - lo) + 1
              const n = plotGeometry.series.length
              const shouldFillColumns = span <= 24
              const sepStep = span <= 48 ? 1 : 3
              return (
                <>
                  {/* month boundary separators */}
                  {Array.from({ length: Math.max(0, Math.floor((span - 1) / sepStep) + 1) }, (_, i) => {
                    const m = lo + i * sepStep
                    if (m > hi) return null
                    const a = monthColumnBandInner(m, n, plotGeometry.innerW, plotGeometry.xScale)
                    const leftInPreview = Math.max(
                      0,
                      Math.min(xBrushOverlayPx[1] - xBrushOverlayPx[0], a.left),
                    )
                    return (
                      <div
                        key={`sep-${m}`}
                        data-testid="nw-x-brush-month-sep"
                        className="absolute top-0 h-full"
                        style={{
                          left: leftInPreview,
                          width: 1,
                          background: 'rgba(56, 189, 248, 0.95)',
                          boxShadow: '0 0 0 1px rgba(2, 132, 199, 0.55)',
                        }}
                      />
                    )
                  })}
                  {/* right edge separator */}
                  {(() => {
                    const aHi = monthColumnBandInner(hi, n, plotGeometry.innerW, plotGeometry.xScale)
                    const leftInPreview = Math.max(
                      0,
                      Math.min(xBrushOverlayPx[1] - xBrushOverlayPx[0], aHi.left + aHi.width),
                    )
                    return (
                      <div
                        data-testid="nw-x-brush-month-sep"
                        className="absolute top-0 h-full"
                        style={{
                          left: Math.max(0, leftInPreview - 1),
                          width: 1,
                          background: 'rgba(56, 189, 248, 0.98)',
                        }}
                      />
                    )
                  })()}

                  {/* filled columns for small spans */}
                  {shouldFillColumns
                    ? Array.from({ length: span }, (_, i) => {
                        const m = lo + i
                        const a = monthColumnBandInner(m, n, plotGeometry.innerW, plotGeometry.xScale)
                        const leftInPreview = Math.max(
                          0,
                          Math.min(xBrushOverlayPx[1] - xBrushOverlayPx[0], a.left),
                        )
                        return (
                          <div
                            // eslint-disable-next-line react/no-array-index-key
                            key={`col-${m}`}
                            data-testid="nw-x-brush-month-col"
                            className="absolute top-0 h-full"
                            style={{
                              left: leftInPreview,
                              width: Math.max(1, a.width),
                              background: 'rgba(56, 189, 248, 0.18)',
                              boxShadow: 'inset 0 0 0 1px rgba(56, 189, 248, 0.55)',
                            }}
                          />
                        )
                      })
                    : null}
                </>
              )
            })()}

            {xBrushSelectedLabel && (
              <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap rounded border border-sky-300/30 bg-slate-950/65 px-2 py-0.5 text-[10px] text-slate-200/95 backdrop-blur-sm">
                <div className="tabular-nums font-medium leading-none">{xBrushSelectedLabel.monthLabel}</div>
                {xBrushSelectedLabel.dateLabel ? (
                  <div className="tabular-nums leading-none text-[9px] text-slate-300">{xBrushSelectedLabel.dateLabel}</div>
                ) : null}
              </div>
            )}
          </div>
        )}
        {plotGeometry && plotCrosshairBand !== null && (
          <div
            data-testid="nw-x-crosshair-band"
            className="pointer-events-none absolute z-[8]"
            style={{
              left: plotGeometry.left + plotCrosshairBand.left,
              width: plotCrosshairBand.width,
              top: plotGeometry.top,
              height: plotGeometry.innerH,
              background: xBrushSelectedMonths ? 'rgba(56, 189, 248, 0.14)' : 'rgba(226, 232, 240, 0.08)',
              boxShadow: xBrushSelectedMonths
                ? 'inset 0 0 0 2px rgba(56, 189, 248, 0.45)'
                : 'inset 0 0 0 1px rgba(226, 232, 240, 0.22)',
            }}
            aria-hidden
          />
        )}
        {plotGeometry &&
          graphSettings.showAssetBreakdown &&
          stackInvestmentIdsOrdered.length > 0 && (
            <div className="nw-graph-tooltip-scroll absolute bottom-2 left-2 z-[15] max-h-[28%] max-w-[min(220px,42vw)] overflow-y-auto rounded-md border border-slate-700/80 bg-slate-950/92 px-2 py-1.5 text-[10px] shadow-lg backdrop-blur-sm">
              <div className="mb-1 font-semibold uppercase tracking-wide text-slate-500">
                {t('graph.investmentStackLegendTitle')}
              </div>
              <ul className="space-y-0.5">
                {stackInvestmentIdsOrdered.map((id) => {
                  const ev = eventsForMarkers.find((e) => e.id === id)
                  const idx = stackInvestmentIdsOrdered.indexOf(id)
                  const c = investmentRibbonFill(
                    eventTypeColors.investment,
                    idx,
                    stackInvestmentIdsOrdered.length,
                  )
                  const label =
                    id === LEDGER_RESIDUAL_EVENT_ID ? t('graph.ledgerResidual') : (ev?.name ?? id)
                  return (
                    <li key={id} className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-sm"
                        style={{ backgroundColor: c }}
                        aria-hidden
                      />
                      <span className="min-w-0 truncate text-slate-300">{label}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        {plotGeometry && markerLayouts.length > 0 && (
          <div
            className={`pointer-events-none absolute inset-0 z-[12] transition-opacity duration-150 ${
              isDragging && !markerDrag ? 'opacity-[0.32]' : 'opacity-100'
            }`}
          >
            {markerLayouts.map((mk) => {
              const ev = mk.ev
              if (!ev) return null
              const fill = eventColorFor(ev)
              const dragging = markerDrag?.id === mk.id
              const anchored =
                !dragging && ghostHoverId === mk.id && ghostHoverAnchor?.id === mk.id
                  ? ghostHoverAnchor
                  : null
              const shortfallBadge = ev.kind === 'investment' && shortfallBadgeIds.has(mk.id)
              return (
                <button
                  key={mk.id}
                  type="button"
                  data-nw-graph-marker
                  title={
                    onRemoveEvent
                      ? `${ev.name} — ${t('graph.markerMiddleDelete')}`
                      : ev.name
                  }
                  aria-label={
                    onRemoveEvent
                      ? t('graph.markerAriaDelete', { name: ev.name })
                      : t('graph.markerAria', { name: ev.name })
                  }
                  className={`pointer-events-auto absolute flex h-[17px] w-[17px] -translate-x-1/2 -translate-y-1/2 touch-none select-none items-center justify-center rounded-full text-[9px] leading-none shadow-md ring-1 ring-slate-950/90 transition-[transform,opacity] duration-100 ease-out hover:scale-110 hover:brightness-110 active:scale-95 ${
                    dragging ? 'z-[14] scale-125 cursor-grabbing opacity-100' : 'cursor-grab'
                  }`}
                  style={{
                    left: anchored?.xCenter ?? mk.xCenter,
                    top: anchored?.yCenter ?? mk.yCenter,
                    backgroundColor: fill,
                    boxShadow: `0 0 0 2px ${eventTintHex(fill, '50')}`,
                  }}
                  onPointerEnter={() => {
                    clearGhostLeaveTimer()
                    if (!markerDrag) {
                      setGhostHoverId(mk.id)
                      // Keep only the hovered marker anchored during y-scale reflows.
                      setGhostHoverAnchor({ id: mk.id, xCenter: mk.xCenter, yCenter: mk.yCenter })
                    }
                  }}
                  onPointerLeave={() => {
                    clearGhostLeaveTimer()
                    // Delay clear slightly so tiny chart reflows during ghost-preview scaling
                    // do not cause enter/leave thrashing when the pointer is still effectively
                    // over the same marker.
                    ghostLeaveTimerRef.current = window.setTimeout(() => {
                      setGhostHoverId(null)
                      ghostLeaveTimerRef.current = null
                    }, 280)
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    if (e.button === 1) {
                      e.preventDefault()
                      onRemoveEvent?.(mk.id)
                      return
                    }
                    e.preventDefault()
                    setGhostHoverId(null)
                    markerDragBeyondThresholdRef.current = false
                    pinnedMonthBeforeMarkerDragRef.current =
                      useAppStore.getState().graphPinnedMonth
                    setMarkerDrag({
                      id: mk.id,
                      originMonth: mk.month,
                      clientX0: e.clientX,
                      clientY0: e.clientY,
                      previewMonth: mk.month,
                    })
                    setMarkerDragPreview({ eventId: mk.id, startMonth: mk.month })
                    e.currentTarget.setPointerCapture(e.pointerId)
                  }}
                  onPointerMove={onMarkerPointerMove}
                  onPointerUp={endMarkerPointer}
                  onPointerCancel={endMarkerPointer}
                  onClick={(e) => {
                    if (suppressMarkerClickRef.current) {
                      e.preventDefault()
                      suppressMarkerClickRef.current = false
                      return
                    }
                    e.stopPropagation()
                    onPickEvent?.(mk.id)
                  }}
                >
                  <span aria-hidden className="pointer-events-none leading-none">
                    {eventEmoji(ev.kind)}
                  </span>
                  {shortfallBadge && (
                    <span
                      className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-[11px] min-w-[11px] items-center justify-center rounded-full bg-amber-500 px-0.5 text-[8px] font-bold leading-none text-slate-950 ring-1 ring-slate-950"
                      title={t('graph.shortfallBadgeTitle')}
                      aria-label={t('graph.shortfallBadgeTitle')}
                    >
                      !
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
        {markerRepositionLineX !== null && (
          <div
            className={`pointer-events-none absolute top-0 bottom-0 z-[6] w-px ${
              dropInvalid
                ? 'bg-rose-400/60 shadow-[0_0_12px_rgba(251,113,133,0.55)]'
                : 'bg-amber-400/55 shadow-[0_0_12px_rgba(251,191,36,0.5)]'
            }`}
            style={{ left: markerRepositionLineX }}
            aria-hidden
          />
        )}
        {dragLineX !== null && (
          <div
            className={`pointer-events-none absolute top-0 bottom-0 z-[5] w-px ${
              dropInvalid
                ? 'bg-rose-400/60 shadow-[0_0_12px_rgba(251,113,133,0.55)]'
                : 'bg-teal-400/50 shadow-[0_0_12px_rgba(45,212,191,0.6)]'
            }`}
            style={{ left: dragLineX }}
            aria-hidden
          />
        )}
        {hover && (
          <div
            ref={tooltipRef}
            className={`absolute top-2 right-2 z-20 flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-slate-900/98 ${tooltipHBox.rootText} text-slate-200 shadow-xl backdrop-blur-sm ${
              graphPinnedMonth !== null
                ? 'border-amber-400/50 shadow-[0_0_20px_-4px_rgba(251,191,36,0.18)]'
                : 'border-slate-600/90'
            }`}
            style={{
              width: displayTooltipW,
              maxWidth: 'calc(100% - 1rem)',
              height: displayTooltipH,
              transform: `translate(${displayTooltipTx}px, ${displayTooltipTy}px)`,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {tooltipStage === 0 ? (
              <div className="flex min-h-0 flex-1 items-center gap-0.5 overflow-hidden px-1 py-0.5">
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-800/80 hover:text-teal-300/95"
                  aria-label={t('graph.tooltipResetPosition')}
                  title={t('graph.tooltipResetPosition')}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    resetTooltipPosition()
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 5a1 1 0 011-1h4m10 0h4a1 1 0 011 1v4m0 6v4a1 1 0 01-1 1h-4m-6 0H5a1 1 0 01-1-1v-4m0-6V5m15 3h-4a2 2 0 00-2 2v4"
                    />
                  </svg>
                </button>
                <div
                  className="nw-graph-tooltip-scroll-x min-w-0 flex-1 cursor-grab overflow-x-auto overflow-y-hidden py-0.5 text-center active:cursor-grabbing"
                  title={t('graph.tooltipDragHandle')}
                  onPointerDown={onTooltipBarPointerDown}
                  onPointerMove={onTooltipBarPointerMove}
                  onPointerUp={endTooltipDrag}
                  onPointerCancel={endTooltipDrag}
                  aria-label={`${formatSimulationMonthShort(
                    hoverSeriesForTooltipDate[0]?.date ?? new Date(),
                    hover.month,
                    appLang,
                  )} — ${formatCurrency(hover.netWorth, currency, appLang)}`}
                >
                  <span
                    className={`inline-block whitespace-nowrap font-figures font-semibold leading-none text-teal-300 tabular-nums ${tooltipHBox.figures}`}
                  >
                    <AnimatedCurrency animate={tooltipCurrencyAnimate}
                      amount={hover.netWorth}
                      currency={currency}
                      lang={appLang}
                      className="font-figures"
                    />
                  </span>
                </div>
              </div>
            ) : (
              <>
            <div
              className={`relative flex shrink-0 touch-none items-stretch gap-0 border-b ${
                graphPinnedMonth !== null ? 'border-amber-500/25' : 'border-slate-600/70'
              }`}
            >
              <div
                className={`flex min-w-0 flex-1 cursor-grab items-center ${tooltipHBox.headerGrabGap} ${tooltipHBox.headerBarPad} active:cursor-grabbing`}
                title={t('graph.tooltipDragHandle')}
                onPointerDown={onTooltipBarPointerDown}
                onPointerMove={onTooltipBarPointerMove}
                onPointerUp={endTooltipDrag}
                onPointerCancel={endTooltipDrag}
              >
                <span
                  className={`shrink-0 select-none leading-none text-slate-500 ${tooltipHBox.labelUpper}`}
                  aria-hidden
                >
                  ⋮⋮
                </span>
                <div
                  className={`min-w-0 truncate font-display font-semibold text-slate-400 ${tooltipHBox.headerTitle}`}
                >
                  {(() => {
                    const snapWithDate = hoverSeriesForTooltipDate[hover.month]
                    const hasDate = snapWithDate?.date != null
                    const simStart = hoverSeriesForTooltipDate[0]?.date ?? new Date()
                    const when = hasDate
                      ? formatMilestoneDateShort(snapWithDate!.date, appLang)
                      : formatSimulationMonthShort(simStart, hover.month, appLang)
                    const simYear = Math.floor(hover.month / 12) + 1
                    const right = `Y${simYear}M${hover.month}`
                    return `${when} · ${right}`
                  })()}
                </div>
              </div>
              {graphPinnedMonth !== null && (
                <div
                  className={`flex shrink-0 items-center border-l border-amber-500/35 text-amber-400/95 ${tooltipHBox.headerBarPad}`}
                  role="status"
                  title={t('graph.pinnedBadgeTitle')}
                  aria-label={t('graph.pinnedBadgeTitle')}
                >
                  <svg
                    className="h-4 w-4 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M12 17v5" />
                    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.79-.9A2 2 0 0 1 15 10.76V6a3 3 0 1 0-6 0v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17" />
                  </svg>
                </div>
              )}
              <button
                type="button"
                className={`shrink-0 border-l text-slate-500 hover:bg-slate-800/80 hover:text-teal-300/95 ${tooltipHBox.headerBarPad} ${
                  graphPinnedMonth !== null ? 'border-amber-500/30' : 'border-slate-600/60'
                }`}
                aria-label={t('graph.tooltipResetPosition')}
                title={t('graph.tooltipResetPosition')}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  resetTooltipPosition()
                }}
              >
                <svg
                  width={tooltipHBox.band === 'xs' ? 14 : 16}
                  height={tooltipHBox.band === 'xs' ? 14 : 16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 5a1 1 0 011-1h4m10 0h4a1 1 0 011 1v4m0 6v4a1 1 0 01-1 1h-4m-6 0H5a1 1 0 01-1-1v-4m0-6V5m15 3h-4a2 2 0 00-2 2v4"
                  />
                </svg>
              </button>
            </div>
            <div className={`shrink-0 pt-2 ${tooltipHBox.pxSection}`}>
              <div
                className={`font-figures font-semibold text-teal-300 tabular-nums ${tooltipHBox.heroNetWorth}`}
              >
                <AnimatedCurrency animate={tooltipCurrencyAnimate}
                  amount={hover.netWorth}
                  currency={currency}
                  lang={appLang}
                  className="font-figures"
                />
              </div>
              {hover.netWorthDelta != null &&
                tooltipStage >= 1 &&
                (tooltipStage >= 2 && hover.contributionRows.length > 0 ? (
                  <div className="mt-1">
                    <button
                      type="button"
                      className={`${tooltipHBox.wideButtonRow} rounded-md px-1 py-1 text-left transition-colors hover:bg-slate-800/85 focus-visible:outline focus-visible:ring-1 focus-visible:ring-teal-500/45`}
                      aria-expanded={deltaBreakdownExpanded && tooltipStage >= 3}
                      aria-label={
                        deltaBreakdownExpanded
                          ? t('graph.deltaBreakdownCollapse')
                          : t('graph.deltaBreakdownExpand')
                      }
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeltaBreakdownExpanded((v) => !v)
                      }}
                    >
                      <span className="flex min-w-0 flex-1 items-start gap-1.5">
                        <span
                          className="inline-block w-3 shrink-0 pt-0.5 text-center text-[9px] text-slate-500"
                          aria-hidden
                        >
                          {deltaBreakdownExpanded ? '▼' : '▶'}
                        </span>
                        <span
                          className={`min-w-0 font-semibold uppercase leading-snug tracking-wide text-slate-500 ${tooltipHBox.labelUpper}`}
                        >
                          {deltaBreakdownExpanded
                            ? t('graph.monthlyChangeBreakdown')
                            : t('graph.netWorthDelta')}
                        </span>
                      </span>
                      <span
                        className={`text-right font-figures tabular-nums ${tooltipHBox.figures} ${
                          tooltipHBox.stackLabelValue ? 'w-full shrink-0' : 'shrink-0'
                        } ${
                          hover.netWorthDelta >= 0 ? 'text-emerald-400/95' : 'text-rose-400/95'
                        }`}
                      >
                        {hover.netWorthDelta >= 0 ? '+' : ''}
                        <AnimatedCurrency animate={tooltipCurrencyAnimate}
                          amount={hover.netWorthDelta}
                          currency={currency}
                          lang={appLang}
                          className="font-figures"
                        />
                        {hover.netWorthDeltaVarianceVsPrior != null && tooltipStage >= 4 && (
                          <span className="ml-0.5 font-normal text-slate-500">
                            ({hover.netWorthDeltaVarianceVsPrior >= 0 ? '+' : ''}
                            <AnimatedCurrency animate={tooltipCurrencyAnimate}
                              amount={hover.netWorthDeltaVarianceVsPrior}
                              currency={currency}
                              lang={appLang}
                              className="font-figures"
                            />
                            )
                          </span>
                        )}
                      </span>
                    </button>
                    {deltaBreakdownExpanded && tooltipStage >= 3 && (
                      <div className="mt-2 border-t border-slate-700/80 pt-2">
                        <p className="mb-1.5 text-[9px] leading-snug text-slate-600">
                          {t('graph.monthlyChangeBreakdownHint')}
                        </p>
                        <ul className={`space-y-1 font-figures ${tooltipHBox.body}`}>
                          {hover.contributionRows.map((row, idx) => (
                            <li key={`${row.eventId}-${idx}`} className={tooltipHBox.listItemRow}>
                              <span className="flex min-w-0 items-center gap-1.5 text-slate-400">
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: row.color }}
                                  aria-hidden
                                />
                                <span className="truncate">
                                  <span className="text-slate-200">{row.name}</span>
                                  {row.kind ? (
                                    <span className="text-slate-500"> · {row.kind}</span>
                                  ) : null}
                                </span>
                              </span>
                              <span
                                className={`text-right tabular-nums ${tooltipHBox.figures} ${
                                  tooltipHBox.stackLabelValue ? 'w-full shrink-0' : 'shrink-0'
                                } ${row.amount >= 0 ? 'text-teal-300/95' : 'text-rose-300/90'}`}
                              >
                                {row.amount >= 0 ? '+' : ''}
                                <AnimatedCurrency animate={tooltipCurrencyAnimate}
                                  amount={row.amount}
                                  currency={currency}
                                  lang={appLang}
                                  className="font-figures"
                                />
                                {row.deltaVsPriorMonth != null && tooltipStage >= 4 && (
                                  <span className="ml-0.5 font-normal text-slate-500">
                                    ({row.deltaVsPriorMonth >= 0 ? '+' : ''}
                                    <AnimatedCurrency animate={tooltipCurrencyAnimate}
                                      amount={row.deltaVsPriorMonth}
                                      currency={currency}
                                      lang={appLang}
                                      className="font-figures"
                                    />
                                    )
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : tooltipStage >= 1 ? (
                  <div className={`mt-1 min-w-0 items-start ${tooltipHBox.pairRow}`}>
                    <span
                      className={`min-w-0 font-semibold uppercase leading-snug tracking-wide text-slate-500 ${tooltipHBox.labelUpper} ${tooltipHBox.stackLabelValue ? '' : 'pt-0.5'}`}
                    >
                      {t('graph.netWorthDelta')}
                    </span>
                    <span
                      className={`min-w-0 text-right font-figures tabular-nums ${tooltipHBox.figures} ${
                        tooltipHBox.stackLabelValue ? 'w-full shrink-0' : 'shrink'
                      } ${
                        hover.netWorthDelta >= 0 ? 'text-emerald-400/95' : 'text-rose-400/95'
                      }`}
                    >
                      {hover.netWorthDelta >= 0 ? '+' : ''}
                      <AnimatedCurrency animate={tooltipCurrencyAnimate}
                        amount={hover.netWorthDelta}
                        currency={currency}
                        lang={appLang}
                        className="font-figures"
                      />
                      {hover.netWorthDeltaVarianceVsPrior != null && tooltipStage >= 4 && (
                        <span className="ml-0.5 font-normal text-slate-500">
                          ({hover.netWorthDeltaVarianceVsPrior >= 0 ? '+' : ''}
                          <AnimatedCurrency animate={tooltipCurrencyAnimate}
                            amount={hover.netWorthDeltaVarianceVsPrior}
                            currency={currency}
                            lang={appLang}
                            className="font-figures"
                          />
                          )
                        </span>
                      )}
                    </span>
                  </div>
                ) : null)}
              {hover.netWorthDelta == null && hover.contributionRows.length > 0 && tooltipStage >= 2 && (
                <div className="mt-2 border-t border-slate-700/80 pt-2">
                  <div
                    className={`mb-0.5 font-semibold uppercase tracking-wide text-slate-500 ${tooltipHBox.labelUpper}`}
                  >
                    {t('graph.eventContributionHeader')}
                  </div>
                  <ul className={`space-y-1 font-figures ${tooltipHBox.body}`}>
                    {hover.contributionRows.map((row, idx) => (
                      <li key={`${row.eventId}-${idx}`} className={tooltipHBox.listItemRow}>
                        <span className="flex min-w-0 items-center gap-1.5 text-slate-400">
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: row.color }}
                            aria-hidden
                          />
                          <span className="truncate">
                            <span className="text-slate-200">{row.name}</span>
                            {row.kind ? <span className="text-slate-500"> · {row.kind}</span> : null}
                          </span>
                        </span>
                        <span
                          className={`text-right tabular-nums ${tooltipHBox.figures} ${
                            tooltipHBox.stackLabelValue ? 'w-full shrink-0' : 'shrink-0'
                          } ${row.amount >= 0 ? 'text-teal-300/95' : 'text-rose-300/90'}`}
                        >
                          {row.amount >= 0 ? '+' : ''}
                          <AnimatedCurrency animate={tooltipCurrencyAnimate}
                            amount={row.amount}
                            currency={currency}
                            lang={appLang}
                            className="font-figures"
                          />
                          {row.deltaVsPriorMonth != null && tooltipStage >= 4 && (
                            <span className="ml-0.5 font-normal text-slate-500">
                              ({row.deltaVsPriorMonth >= 0 ? '+' : ''}
                              <AnimatedCurrency animate={tooltipCurrencyAnimate}
                                amount={row.deltaVsPriorMonth}
                                currency={currency}
                                lang={appLang}
                                className="font-figures"
                              />
                              )
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {tooltipStage >= 1 && (
            <div
              className={`nw-graph-tooltip-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2 pt-2 ${tooltipHBox.pxSection}`}
            >
              <div className={`space-y-1 border-t border-slate-700/80 pt-2 font-figures ${tooltipHBox.body}`}>
                <div className={tooltipHBox.pairRow}>
                  <span style={{ color: '#94a3b8' }}>{t('graph.cash')}</span>
                  <span
                    className={`tabular-nums text-slate-300 ${tooltipHBox.stackLabelValue ? 'w-full shrink-0 text-right' : 'shrink-0'}`}
                  >
                    <AnimatedCurrency animate={tooltipCurrencyAnimate}
                      amount={hover.liquid}
                      currency={currency}
                      lang={appLang}
                      className="font-figures"
                    />
                  </span>
                </div>
                <div
                  className={`rounded-md border border-slate-700/60 bg-slate-950/40 ${tooltipHBox.nestedCardPad}`}
                >
                  {hover.poolFlowLines.length > 0 && tooltipStage >= 2 ? (
                    <button
                      type="button"
                      className={`${tooltipHBox.wideButtonRow} rounded-md px-0 py-0.5 text-left transition-colors hover:bg-slate-800/40 focus-visible:outline focus-visible:ring-1 focus-visible:ring-teal-500/45`}
                      aria-expanded={reserveFlowExpanded && tooltipStage >= 3}
                      aria-label={
                        reserveFlowExpanded
                          ? t('graph.reserveFlowCollapse')
                          : t('graph.reserveFlowExpand')
                      }
                      onClick={(e) => {
                        e.stopPropagation()
                        setReserveFlowExpanded((v) => !v)
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className={`font-semibold uppercase tracking-wide text-slate-500 ${tooltipHBox.labelUpper}`}
                        >
                          {t('graph.reserveSectionTitle')}
                        </div>
                        <div className={`mt-1 pr-1 ${tooltipHBox.pairRow}`}>
                          <span style={{ color: graphAssetColors.savingsPool }}>{t('graph.savingsPool')}</span>
                          <span
                            className={`tabular-nums text-slate-300 ${tooltipHBox.stackLabelValue ? 'w-full shrink-0 text-right' : 'shrink-0'}`}
                          >
                            <AnimatedCurrency animate={tooltipCurrencyAnimate}
                              amount={hover.savingsPool}
                              currency={currency}
                              lang={appLang}
                              className="font-figures"
                            />
                          </span>
                        </div>
                        {hover.savingsPoolDeltaVsPrior != null && tooltipStage >= 2 && (
                          <div className={`mt-0.5 ${tooltipHBox.pairRow} ${tooltipHBox.labelUpper}`}>
                            <span className="text-slate-500">{t('graph.reserveDeltaVsPrior')}</span>
                            <span
                              className={`tabular-nums ${
                                tooltipHBox.stackLabelValue ? 'w-full shrink-0 text-right' : 'shrink-0'
                              } ${
                                hover.savingsPoolDeltaVsPrior >= 0 ? 'text-emerald-400/90' : 'text-rose-400/90'
                              }`}
                            >
                              {hover.savingsPoolDeltaVsPrior >= 0 ? '+' : ''}
                              <AnimatedCurrency animate={tooltipCurrencyAnimate}
                                amount={hover.savingsPoolDeltaVsPrior}
                                currency={currency}
                                lang={appLang}
                                className="font-figures"
                              />
                            </span>
                          </div>
                        )}
                      </div>
                      <span
                        className={`shrink-0 select-none pt-0.5 text-slate-500 ${tooltipHBox.band === 'xs' ? 'text-[8px]' : 'text-[9px]'}`}
                        aria-hidden
                      >
                        {reserveFlowExpanded ? '▼' : '▶'}
                      </span>
                    </button>
                  ) : (
                    <div>
                      <div
                        className={`font-semibold uppercase tracking-wide text-slate-500 ${tooltipHBox.labelUpper}`}
                      >
                        {t('graph.reserveSectionTitle')}
                      </div>
                      <div className={`mt-1 ${tooltipHBox.pairRow}`}>
                        <span style={{ color: graphAssetColors.savingsPool }}>{t('graph.savingsPool')}</span>
                        <span
                          className={`tabular-nums text-slate-300 ${tooltipHBox.stackLabelValue ? 'w-full shrink-0 text-right' : 'shrink-0'}`}
                        >
                          <AnimatedCurrency animate={tooltipCurrencyAnimate}
                            amount={hover.savingsPool}
                            currency={currency}
                            lang={appLang}
                            className="font-figures"
                          />
                        </span>
                      </div>
                      {hover.savingsPoolDeltaVsPrior != null && tooltipStage >= 2 && (
                        <div className={`mt-0.5 ${tooltipHBox.pairRow} ${tooltipHBox.labelUpper}`}>
                          <span className="text-slate-500">{t('graph.reserveDeltaVsPrior')}</span>
                          <span
                            className={`tabular-nums ${
                              tooltipHBox.stackLabelValue ? 'w-full shrink-0 text-right' : 'shrink-0'
                            } ${
                              hover.savingsPoolDeltaVsPrior >= 0 ? 'text-emerald-400/90' : 'text-rose-400/90'
                            }`}
                          >
                            {hover.savingsPoolDeltaVsPrior >= 0 ? '+' : ''}
                            <AnimatedCurrency animate={tooltipCurrencyAnimate}
                              amount={hover.savingsPoolDeltaVsPrior}
                              currency={currency}
                              lang={appLang}
                              className="font-figures"
                            />
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {reserveFlowExpanded &&
                    tooltipStage >= 3 &&
                    (poolFlowIns.length > 0 || poolFlowOuts.length > 0) && (
                    <div className="mt-2 space-y-2 border-t border-slate-700/80 pt-2">
                      {poolFlowIns.length > 0 && (
                        <div>
                          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-emerald-400/95">
                            {t('graph.poolFlowInHeader')}
                          </div>
                          <ul className="space-y-1">
                            {poolFlowIns.map((row) => (
                              <li key={row.lineKey} className={tooltipHBox.listItemRow}>
                                <span className="text-emerald-400/95">{t(POOL_FLOW_LINE_I18N[row.lineKey])}</span>
                                <span
                                  className={`tabular-nums text-emerald-400/95 ${tooltipHBox.stackLabelValue ? 'w-full shrink-0 text-right' : 'shrink-0'}`}
                                >
                                  +
                                  <AnimatedCurrency animate={tooltipCurrencyAnimate}
                                    amount={row.amount}
                                    currency={currency}
                                    lang={appLang}
                                    className="font-figures"
                                  />
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {poolFlowOuts.length > 0 && (
                        <div>
                          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-rose-400/95">
                            {t('graph.poolFlowOutHeader')}
                          </div>
                          <ul className="space-y-1">
                            {poolFlowOuts.map((row) => (
                              <li key={row.lineKey} className={tooltipHBox.listItemRow}>
                                <span className="text-rose-400/95">{t(POOL_FLOW_LINE_I18N[row.lineKey])}</span>
                                <span
                                  className={`tabular-nums text-rose-400/95 ${tooltipHBox.stackLabelValue ? 'w-full shrink-0 text-right' : 'shrink-0'}`}
                                >
                                  −
                                  <AnimatedCurrency animate={tooltipCurrencyAnimate}
                                    amount={row.amount}
                                    currency={currency}
                                    lang={appLang}
                                    className="font-figures"
                                  />
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {hover.investmentShortfall > 0 && (
                  <div className={`text-amber-400/95 ${tooltipHBox.pairRow}`}>
                    <span>{t('graph.invShortfall')}</span>
                    <span
                      className={`tabular-nums ${tooltipHBox.stackLabelValue ? 'w-full shrink-0 text-right' : 'shrink-0'}`}
                    >
                      <AnimatedCurrency animate={tooltipCurrencyAnimate}
                        amount={hover.investmentShortfall}
                        currency={currency}
                        lang={appLang}
                        className="font-figures"
                      />
                    </span>
                  </div>
                )}
                <div className={tooltipHBox.pairRow}>
                  <span style={{ color: '#3b82f6' }}>{t('graph.investments')}</span>
                  <span
                    className={`tabular-nums ${tooltipHBox.stackLabelValue ? 'w-full shrink-0 text-right' : 'shrink-0'}`}
                  >
                    <AnimatedCurrency animate={tooltipCurrencyAnimate}
                      amount={hover.investment}
                      currency={currency}
                      lang={appLang}
                      className="font-figures"
                    />
                  </span>
                </div>
                {investmentStackHoverSlice && tooltipStage >= 2 && (
                  <div className={`border-l-2 border-sky-500/45 pl-2 ${tooltipHBox.pairRow}`}>
                    <span className={`min-w-0 truncate text-sky-300/90 ${tooltipHBox.body}`}>
                      {investmentStackHoverSlice.name}
                    </span>
                    <span
                      className={`font-figures tabular-nums text-sky-200 ${tooltipHBox.stackLabelValue ? 'w-full shrink-0 text-right' : 'shrink-0'}`}
                    >
                      <AnimatedCurrency animate={tooltipCurrencyAnimate}
                        amount={investmentStackHoverSlice.amount}
                        currency={currency}
                        lang={appLang}
                        className="font-figures"
                      />
                    </span>
                  </div>
                )}
                <div className={tooltipHBox.pairRow}>
                  <span style={{ color: '#10b981' }}>{t('graph.physical')}</span>
                  <span
                    className={`tabular-nums ${tooltipHBox.stackLabelValue ? 'w-full shrink-0 text-right' : 'shrink-0'}`}
                  >
                    <AnimatedCurrency animate={tooltipCurrencyAnimate}
                      amount={hover.physical}
                      currency={currency}
                      lang={appLang}
                      className="font-figures"
                    />
                  </span>
                </div>
                {hover.liabilities > 0.01 && (
                  <div className={tooltipHBox.pairRow}>
                    <span style={{ color: graphAssetAreaColors.debt }}>{t('graph.liabilities')}</span>
                    <span
                      className={`tabular-nums text-rose-300/95 ${tooltipHBox.stackLabelValue ? 'w-full shrink-0 text-right' : 'shrink-0'}`}
                    >
                      <AnimatedCurrency animate={tooltipCurrencyAnimate}
                        amount={-hover.liabilities}
                        currency={currency}
                        lang={appLang}
                        className="font-figures"
                      />
                    </span>
                  </div>
                )}
              </div>
              {tooltipStage >= 2 && (
              <div className="mt-3 border-t border-slate-700/80 pt-2">
                <div
                  className={`mb-1 font-semibold uppercase tracking-wide text-slate-500 ${tooltipHBox.labelUpper}`}
                >
                  {t('graph.activeEvents')}
                </div>
                {hover.activeRows.length === 0 ? (
                  <p className={`leading-snug text-slate-500 ${tooltipHBox.body}`}>{t('graph.noneBaseline')}</p>
                ) : (
                  <ul className="space-y-1">
                    {hover.activeRows.map((row) => (
                      <li
                        key={row.id}
                        className={`rounded-md bg-slate-950/60 py-0.5 pl-1 pr-0.5 ${
                          tooltipHBox.stackLabelValue
                            ? 'flex flex-col gap-1'
                            : 'flex items-center gap-1.5'
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: row.color }}
                            aria-hidden
                          />
                          <span
                            className={`min-w-0 flex-1 truncate font-figures leading-tight ${tooltipHBox.body}`}
                          >
                            <span className="font-medium text-slate-200">{row.name}</span>
                            {tooltipStage >= 4 && (
                              <span className="text-slate-500"> · {row.kind}</span>
                            )}
                          </span>
                        </div>
                        <div
                          className={`flex shrink-0 items-center gap-0.5 ${tooltipHBox.stackLabelValue ? 'self-end' : ''}`}
                        >
                          {row.startsThisMonth && (
                            <span
                              className="mr-0.5 rounded border border-emerald-500/45 bg-emerald-500/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-emerald-300/95"
                              title={t('graph.eventNewBadgeTitle')}
                            >
                              {t('graph.eventNewBadge')}
                            </span>
                          )}
                          {onPickEvent && (
                            <button
                              type="button"
                              className="rounded px-1.5 py-1 text-[10px] font-medium text-teal-400/95 hover:bg-teal-950/60 hover:text-teal-300"
                              aria-label={t('graph.editAria', { name: row.name })}
                              onClick={(e) => {
                                e.stopPropagation()
                                onPickEvent(row.id)
                              }}
                            >
                              {t('graph.edit')}
                            </button>
                          )}
                          {onRemoveEvent && (
                            <button
                              type="button"
                              className="rounded p-1 text-slate-500 hover:bg-rose-950/50 hover:text-rose-400"
                              aria-label={t('graph.deleteAria', { name: row.name })}
                              onClick={(e) => {
                                e.stopPropagation()
                                onRemoveEvent(row.id)
                              }}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                aria-hidden
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              )}
            </div>
            )}
              </>
            )}
            {(
              [
                ['nw', 'cursor-nwse-resize', { top: -6, left: -6, width: 14, height: 14 }],
                [
                  'n',
                  'cursor-ns-resize -translate-x-1/2',
                  { top: -6, left: '50%', width: 36, height: 14 },
                ],
                ['ne', 'cursor-nesw-resize', { top: -6, right: -6, width: 14, height: 14 }],
                [
                  'w',
                  'cursor-ew-resize -translate-y-1/2',
                  { top: '50%', left: -6, width: 14, height: 36 },
                ],
                [
                  'e',
                  'cursor-ew-resize -translate-y-1/2',
                  { top: '50%', right: -6, width: 14, height: 36 },
                ],
                ['sw', 'cursor-nesw-resize', { bottom: -6, left: -6, width: 14, height: 14 }],
                [
                  's',
                  'cursor-ns-resize -translate-x-1/2',
                  { bottom: -6, left: '50%', width: 36, height: 14 },
                ],
                ['se', 'cursor-nwse-resize', { bottom: -6, right: -6, width: 14, height: 14 }],
              ] as const
            ).map(([edge, cursor, style]) => (
              <div
                key={edge}
                role="presentation"
                aria-hidden
                title={t('graph.tooltipResizeHandle')}
                className={`pointer-events-auto absolute z-[40] touch-none ${cursor}`}
                style={style}
                onPointerDown={(ev) => onTooltipResizePointerDown(ev, edge)}
                onPointerMove={onTooltipResizePointerMove}
                onPointerUp={endTooltipResize}
                onPointerCancel={endTooltipResize}
              />
            ))}
          </div>
        )}
      </div>
      {plotGeometry ? (
        <div className="pointer-events-auto absolute right-2 top-2 z-[60] flex items-center gap-1">
          <button
            type="button"
            data-testid="nw-zoom-back"
            className="rounded border border-slate-600/90 bg-slate-900/90 px-2 py-0.5 text-[10px] font-medium text-slate-300 shadow-sm backdrop-blur-sm transition-colors hover:border-slate-500 hover:bg-slate-800/90 disabled:pointer-events-none disabled:opacity-35"
            disabled={xZoomHistory.length === 0}
            onClick={handleZoomBack}
          >
            {t('graph.zoomBack')}
          </button>
          <button
            type="button"
            data-testid="nw-zoom-reset"
            className="rounded border border-slate-600/90 bg-slate-900/90 px-2 py-0.5 text-[10px] font-medium text-slate-300 shadow-sm backdrop-blur-sm transition-colors hover:border-slate-500 hover:bg-slate-800/90 disabled:pointer-events-none disabled:opacity-35"
            disabled={graphSettings.zoomRange === null && xZoomHistory.length === 0}
            onClick={handleZoomReset}
          >
            {t('graph.zoomReset')}
          </button>
        </div>
      ) : null}
    </motion.div>
  )
}
