import { useTranslation } from 'react-i18next'
import { useDeferredValue, useMemo } from 'react'
import { syncEndFromDuration } from '../../events/syncEventWindow'
import type { FinancialEvent } from '../../events/types'
import { simulate, simulationHorizonMonths } from '../../engine/simulate'
import { AnimatedCurrency } from '../shared/AnimatedCurrency'
import { useAppStore } from '../../store/useAppStore'
import { pickYValue, scaledSavingsPool } from '../../engine/snapshotDisplay'
import { graphAssetColors } from '../../utils/colors'
import { formatCurrency } from '../../utils/formatting'

export function HeroKpiStrip() {
  const { t } = useTranslation()
  const simulation = useAppStore((s) => s.simulation)
  const events = useAppStore((s) => s.events)
  const isDragging = useAppStore((s) => s.isDragging)
  const draggingDraft = useAppStore((s) => s.draggingDraft)
  const dragPreviewMonth = useAppStore((s) => s.dragPreviewMonth)
  /** Shared drag preview computed once per pointer move in `setDragging` (also drives the graph). */
  const dragPreviewSnapshots = useAppStore((s) => s.dragPreviewSnapshots)
  const markerDragPreview = useAppStore((s) => s.markerDragPreview)
  const projectionYears = useAppStore((s) => s.projectionYears)
  const currency = useAppStore((s) => s.currency)
  const lang = useAppStore((s) => s.lang)
  const showReal = useAppStore((s) => s.graphSettings.showRealValues)

  const months = useMemo(() => simulationHorizonMonths(projectionYears), [projectionYears])

  /** Placement preview: reuse the shared simulation (same merged timeline as the graph). */
  const placementPreviewSnapshots =
    isDragging && draggingDraft && dragPreviewMonth !== null ? dragPreviewSnapshots : null

  /**
   * Same merge as graph marker drag; the start month is deferred so the KPI tracks the
   * (deferred) graph curve instead of running an immediate full simulation per pointer move.
   */
  const deferredMarkerDragPreview = useDeferredValue(markerDragPreview)
  const markerRepositionPreviewSnapshots = useMemo(() => {
    if (!deferredMarkerDragPreview) return null
    if (!events.some((e) => e.id === deferredMarkerDragPreview.eventId)) return null
    const merged = events.map((e) =>
      e.id === deferredMarkerDragPreview.eventId
        ? syncEndFromDuration({
            ...e,
            startMonth: deferredMarkerDragPreview.startMonth,
          } as FinancialEvent)
        : e,
    )
    return simulate(merged, new Date(), months)
  }, [deferredMarkerDragPreview, events, months])

  const series =
    markerRepositionPreviewSnapshots?.length
      ? markerRepositionPreviewSnapshots
      : placementPreviewSnapshots?.length
        ? placementPreviewSnapshots
        : simulation

  const showingPreview =
    Boolean(markerRepositionPreviewSnapshots?.length) ||
    Boolean(placementPreviewSnapshots?.length)

  /** Marker / placement previews update every frame; skip RAF easing to match the graph. */
  const kpiCurrencyAnimate = markerDragPreview === null

  const last = series[series.length - 1]
  const first = series[0]
  const nominal = last?.netWorth ?? 0
  const real = last?.realNetWorth ?? 0
  const display = showReal ? real : nominal
  const start = first ? pickYValue(first, showReal) : 0
  const delta = last && first ? display - start : 0
  const alt = last ? (showReal ? nominal : real) : 0
  const poolEnd = last ? scaledSavingsPool(last, showReal) : 0
  const poolStart = first ? scaledSavingsPool(first, showReal) : 0

  if (series.length === 0) return null

  return (
    <div className="mb-2 flex min-h-0 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-800/80 bg-slate-900/40 px-3 py-2 backdrop-blur-sm">
      <div className="min-w-0 flex-1">
        <p className="font-display truncate text-[9px] font-medium uppercase tracking-wider text-slate-500">
          {showingPreview
            ? t('kpi.endPreview', { years: projectionYears, months })
            : t('kpi.end', { years: projectionYears, months })}
        </p>
        <p className="font-figures truncate text-lg font-semibold tracking-tight text-teal-300 tabular-nums sm:text-xl">
          <AnimatedCurrency
            amount={display}
            currency={currency}
            lang={lang}
            animate={kpiCurrencyAnimate}
            className="font-figures"
          />
        </p>
      </div>
      <div className="font-figures shrink-0 border-l border-slate-700/90 pl-4 text-left text-[10px] tabular-nums">
        <p className="font-display text-[9px] font-medium uppercase tracking-wider text-slate-500">
          {t('kpi.savingsPool')}
        </p>
        <p className="text-sm font-semibold tabular-nums" style={{ color: graphAssetColors.savingsPool }}>
          <AnimatedCurrency
            amount={poolEnd}
            currency={currency}
            lang={lang}
            animate={kpiCurrencyAnimate}
            className="font-figures"
          />
        </p>
        <p className="truncate text-slate-600">
          {t('kpi.start', { amount: formatCurrency(poolStart, currency, lang) })}
        </p>
      </div>
      <div className="font-figures shrink-0 text-right text-[10px] tabular-nums text-slate-500">
        <span className={delta >= 0 ? 'text-emerald-400/90' : 'text-rose-400/90'}>
          {delta >= 0 ? '+' : ''}
          <AnimatedCurrency
            amount={delta}
            currency={currency}
            lang={lang}
            animate={kpiCurrencyAnimate}
            className="font-figures"
          />
        </span>
        <span className="block truncate text-slate-600">
          {t('kpi.alt', { amount: formatCurrency(alt, currency, lang) })}
        </span>
      </div>
    </div>
  )
}
