import * as d3 from 'd3'
import type { TFunction } from 'i18next'
import type { Milestone } from '../../engine/types'
import type { AppLang } from '../../store/useAppStore'
import {
  formatCompactCurrency,
  formatCurrency,
  formatMilestoneDateShort,
} from '../../utils/formatting'
import {
  milestonePaintOrderByKey,
  milestoneSegmentHoverKey,
  milestoneSegments,
  milestoneLines,
  type MilestoneSegmentKind,
} from './GraphLayers'

function milestoneGuideStroke(kind: MilestoneSegmentKind): string {
  if (kind === 'real') return 'rgba(45, 212, 191, 0.58)'
  return 'rgba(250, 204, 21, 0.55)'
}

function milestonePlotLabelFill(kind: MilestoneSegmentKind): string {
  if (kind === 'real') return '#99f6e4'
  return '#fde68a'
}

function milestoneChipStroke(kind: MilestoneSegmentKind): string {
  if (kind === 'real') return 'rgba(45, 212, 191, 0.7)'
  return 'rgba(250, 204, 21, 0.65)'
}

export type MilestoneSegDraw = {
  m: Milestone
  kind: MilestoneSegmentKind
  month: number
  hoverKey: string
}

export type MilestoneDrawParams = {
  segFlat: MilestoneSegDraw[]
  innerW: number
  innerH: number
  xScale: d3.ScaleLinear<number, number>
  milestoneHoverKey: string | null
  milestonePinnedKey: string | null
  milestonePad: number
  milestoneLabelTop: number
  milestoneLineTop: number
  lang: AppLang
  currency: string
  t: TFunction
  cancelMilestoneHoverClear: () => void
  scheduleMilestoneHoverClear: () => void
  setMilestoneHoverKey: (k: string | null) => void
  /** Real $ chart: inflation-adjusted crossings only — show `real` plot labels without requiring hover. */
  useRealDollars?: boolean
  /** While true, ignore mouseleave from D3 removing/rebuilding nodes (hover state stays in React). */
  suppressHoverLeave?: () => boolean
}

export function buildMilestoneSegFlat(
  milestonesForGraph: Milestone[],
  xMax: number,
  /** When true (Real $ chart), only inflation-adjusted crossings: `real` and `unified` segments. */
  useRealDollars = false,
): MilestoneSegDraw[] {
  const msVisible = milestoneLines(milestonesForGraph, xMax)
  const segFlat: MilestoneSegDraw[] = []
  for (const m of msVisible) {
    for (const seg of milestoneSegments(m, xMax)) {
      if (useRealDollars && seg.kind === 'nominal') continue
      segFlat.push({
        m,
        kind: seg.kind,
        month: seg.month,
        hoverKey: milestoneSegmentHoverKey(m, seg.kind),
      })
    }
  }
  return segFlat
}

/** Plot-area milestone guides + chips (inside `.nw-milestone-chip-layer`). */
export function drawMilestoneVlinesAndPlotLabels(
  chipLayer: d3.Selection<SVGGElement, unknown, null, undefined>,
  p: MilestoneDrawParams,
): void {
  const {
    segFlat,
    innerW,
    innerH,
    xScale,
    milestoneHoverKey,
    milestonePinnedKey,
    milestonePad,
    milestoneLabelTop,
    milestoneLineTop,
    lang,
    currency,
    t,
    cancelMilestoneHoverClear,
    scheduleMilestoneHoverClear,
    setMilestoneHoverKey,
    useRealDollars = false,
    suppressHoverLeave,
  } = p

  const milestonePaintKey = milestoneHoverKey ?? milestonePinnedKey
  const vLineOrder = milestonePaintOrderByKey(segFlat, milestonePaintKey)
  const plotLabelOrder = milestonePaintOrderByKey(segFlat, milestonePaintKey)

  const milestoneVLines = chipLayer
    .append('g')
    .attr('class', 'nw-milestone-vlines')
    .attr('pointer-events', 'none')

  for (const seg of vLineOrder) {
    const { m, kind, month, hoverKey } = seg
    const xv = xScale(month)
    const amountFull = formatCurrency(m.value, currency, lang)
    const whenShort = formatMilestoneDateShort(m.achievedAt, lang)
    const whenNom =
      m.achievedAtNominal != null ? formatMilestoneDateShort(m.achievedAtNominal, lang) : '—'
    const whenReal =
      m.achievedAtReal != null ? formatMilestoneDateShort(m.achievedAtReal, lang) : '—'
    const dual =
      m.nominalMonth != null && m.realMonth != null && m.nominalMonth !== m.realMonth
    const defaultTitle = dual
      ? t('graph.milestoneTitleDual', {
          amount: amountFull,
          whenNom,
          whenReal,
          monthNom: m.nominalMonth ?? m.month,
          monthReal: m.realMonth ?? m.month,
        })
      : t('graph.milestoneTitle', {
          amount: amountFull,
          when: whenShort,
          month: m.month,
        })
    const vTitle =
      kind === 'real'
        ? t('graph.milestoneVLineInflationAdjusted', {
            amount: amountFull,
            when: whenReal,
            month: m.realMonth ?? m.month,
          })
        : defaultTitle

    const gLine = milestoneVLines
      .append('g')
      .attr('class', 'nw-milestone-vline')
      .attr('pointer-events', 'all')
      .style('cursor', 'pointer')
      .on('mouseenter', () => {
        cancelMilestoneHoverClear()
        setMilestoneHoverKey(hoverKey)
      })
      .on('mouseleave', () => {
        if (suppressHoverLeave?.()) return
        if (kind === 'real') scheduleMilestoneHoverClear()
        else {
          cancelMilestoneHoverClear()
          setMilestoneHoverKey(null)
        }
      })
      .on('click', (e: MouseEvent) => e.stopPropagation())
    gLine.append('title').text(vTitle)
    gLine
      .append('line')
      .attr('pointer-events', 'none')
      .attr('x1', xv)
      .attr('x2', xv)
      .attr('y1', milestoneLineTop)
      .attr('y2', innerH)
      .attr('stroke', milestoneGuideStroke(kind))
      .attr('stroke-dasharray', '4 3')
    gLine
      .append('line')
      .attr('x1', xv)
      .attr('x2', xv)
      .attr('y1', milestoneLineTop)
      .attr('y2', innerH)
      .attr('stroke', 'transparent')
      .attr('stroke-width', 22)
      .attr('pointer-events', 'stroke')
  }

  for (const seg of plotLabelOrder) {
    const { m, kind, month, hoverKey } = seg
    const hideRealUntilHover =
      kind === 'real' && !useRealDollars && milestoneHoverKey !== hoverKey && milestonePinnedKey !== hoverKey
    if (hideRealUntilHover) continue
    const amountFull = formatCurrency(m.value, currency, lang)
    const amountCompact = formatCompactCurrency(m.value, currency, lang)
    const whenShort = formatMilestoneDateShort(m.achievedAt, lang)
    const whenNom =
      m.achievedAtNominal != null ? formatMilestoneDateShort(m.achievedAtNominal, lang) : '—'
    const whenReal =
      m.achievedAtReal != null ? formatMilestoneDateShort(m.achievedAtReal, lang) : '—'
    const dual =
      m.nominalMonth != null && m.realMonth != null && m.nominalMonth !== m.realMonth
    const defaultTitle = dual
      ? t('graph.milestoneTitleDual', {
          amount: amountFull,
          whenNom,
          whenReal,
          monthNom: m.nominalMonth ?? m.month,
          monthReal: m.realMonth ?? m.month,
        })
      : t('graph.milestoneTitle', {
          amount: amountFull,
          when: whenShort,
          month: m.month,
        })
    const titleStr =
      kind === 'real'
        ? t('graph.milestoneVLineInflationAdjusted', {
            amount: amountFull,
            when: whenReal,
            month: m.realMonth ?? m.month,
          })
        : defaultTitle

    const labelX0 = xScale(month)
    const expanded = milestoneHoverKey === hoverKey || milestonePinnedKey === hoverKey
    const g = chipLayer
      .append('g')
      .attr('class', 'nw-milestone-plot-label')
      .attr('pointer-events', 'all')
      .style('cursor', 'pointer')
      .on('mouseenter', () => {
        cancelMilestoneHoverClear()
        setMilestoneHoverKey(hoverKey)
      })
      .on('mouseleave', () => {
        if (suppressHoverLeave?.()) return
        if (kind === 'real') scheduleMilestoneHoverClear()
        else {
          cancelMilestoneHoverClear()
          setMilestoneHoverKey(null)
        }
      })
      .on('click', (e: MouseEvent) => e.stopPropagation())

    g.append('title').text(titleStr)

    const label = g
      .append('text')
      .attr('x', labelX0)
      .attr('y', milestoneLabelTop)
      .attr('text-anchor', 'middle')
      .attr('text-rendering', 'geometricPrecision')
      .attr('fill', milestonePlotLabelFill(kind))
      .attr('font-size', expanded ? 8 : 9)
      .attr('font-weight', '600')
      .style('font-family', 'ui-sans-serif, system-ui, sans-serif')

    if (expanded) {
      if (kind === 'nominal') {
        label
          .append('tspan')
          .attr('x', labelX0)
          .attr('dy', 0)
          .text(t('graph.milestoneCrossingLine', { amount: amountCompact, when: whenNom }))
      } else if (kind === 'real') {
        label
          .append('tspan')
          .attr('x', labelX0)
          .attr('dy', 0)
          .text(t('graph.milestoneRealLine', { amount: amountCompact, when: whenReal }))
      } else if (dual) {
        label
          .append('tspan')
          .attr('x', labelX0)
          .attr('dy', 0)
          .text(t('graph.milestoneCrossingLine', { amount: amountCompact, when: whenNom }))
        label
          .append('tspan')
          .attr('x', labelX0)
          .attr('dy', '1.05em')
          .text(t('graph.milestoneRealLine', { amount: amountCompact, when: whenReal }))
      } else {
        label.append('tspan').attr('x', labelX0).attr('dy', 0).text(amountCompact)
        label.append('tspan').attr('x', labelX0).attr('dy', '1.05em').text(whenShort)
      }
    } else {
      label
        .append('tspan')
        .attr('x', labelX0)
        .attr('dy', 0)
        .text(t('graph.milestoneCompact', { amount: amountCompact }))
    }

    const textNode = label.node()
    if (!textNode) continue
    let bb = textNode.getBBox()
    let tx = labelX0
    if (bb.x < 4) tx += 4 - bb.x
    if (bb.x + bb.width > innerW - 4) tx -= bb.x + bb.width - (innerW - 4)
    if (tx !== labelX0) {
      label.selectAll('tspan').attr('x', tx)
      label.attr('x', tx)
    }
    bb = textNode.getBBox()

    g.insert('rect', 'text')
      .attr('x', bb.x - milestonePad)
      .attr('y', bb.y - milestonePad)
      .attr('width', bb.width + milestonePad * 2)
      .attr('height', bb.height + milestonePad * 2)
      .attr('rx', 4)
      .attr('fill', 'rgba(15, 23, 42, 0.94)')
      .attr('stroke', milestoneChipStroke(kind))
      .attr('stroke-width', expanded ? 1.25 : 1)
  }
}
