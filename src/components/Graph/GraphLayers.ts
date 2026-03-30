import * as d3 from 'd3'
import type { FinancialEvent } from '../../events/types'
import type { Milestone, MonthSnapshot } from '../../engine/types'
import { pickYValue } from '../../engine/snapshotDisplay'

/** Extra bottom space for milestone markers under the main x-axis. */
export const GRAPH_MARGIN = { top: 12, right: 20, bottom: 64, left: 56 }

export { pickYValue, scaledSavingsPool, snapshotInflationScale } from '../../engine/snapshotDisplay'

export function buildLinearReferencePoints(
  snapshots: MonthSnapshot[],
  useReal: boolean,
): { x: number; y: number }[] {
  if (snapshots.length === 0) return []
  const y0 = pickYValue(snapshots[0]!, useReal)
  const y1 = pickYValue(snapshots[snapshots.length - 1]!, useReal)
  const n = snapshots.length
  return [
    { x: 0, y: y0 },
    { x: n - 1, y: y1 },
  ]
}

export function drawGrid(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: d3.ScaleLinear<number, number>,
  yScale: d3.ScaleLinear<number, number>,
  width: number,
  height: number,
): void {
  const gx = g.append('g').attr('class', 'grid-x')
  const gy = g.append('g').attr('class', 'grid-y')
  const xticks = xScale.ticks(8)
  const yticks = yScale.ticks(6)
  gx.selectAll('line')
    .data(xticks)
    .join('line')
    .attr('x1', (d) => xScale(d))
    .attr('x2', (d) => xScale(d))
    .attr('y1', 0)
    .attr('y2', height)
    .attr('stroke', 'rgba(148,163,184,0.15)')
    .attr('stroke-dasharray', '4 4')
  gy.selectAll('line')
    .data(yticks)
    .join('line')
    .attr('x1', 0)
    .attr('x2', width)
    .attr('y1', (d) => yScale(d))
    .attr('y2', (d) => yScale(d))
    .attr('stroke', 'rgba(148,163,184,0.15)')
    .attr('stroke-dasharray', '4 4')
}

/** Horizontal line at net worth = 0 — visually stronger than grid (proposal §7). */
export function drawZeroLine(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  yScale: d3.ScaleLinear<number, number>,
  innerW: number,
  innerH: number,
): void {
  const [d0, d1] = yScale.domain()
  if (!(d0 <= 0 && 0 <= d1)) return
  const y0 = yScale(0)
  if (!Number.isFinite(y0) || y0 < -1 || y0 > innerH + 1) return
  g.append('line')
    .attr('class', 'nw-zero-line')
    .attr('x1', 0)
    .attr('x2', innerW)
    .attr('y1', y0)
    .attr('y2', y0)
    .attr('stroke', 'rgba(45, 212, 191, 0.65)')
    .attr('stroke-width', 1.5)
}

/** Calendar year of the first day of simulation month `monthIndex` (0 = start month). */
export function calendarYearForSimulationMonth(simulationStart: Date, monthIndex: number): number {
  const d = new Date(
    simulationStart.getFullYear(),
    simulationStart.getMonth() + monthIndex,
    1,
  )
  return d.getFullYear()
}

/** Month indices at Jan boundaries of each simulation year (0, 12, 24, …) within the horizon. */
export function xAxisYearBoundaryMonths(totalMonths: number): number[] {
  const last = Math.max(0, totalMonths - 1)
  const out: number[] = []
  for (let m = 0; m <= last; m += 12) out.push(m)
  return out
}

/**
 * Inner-plot horizontal span for the vertical band covering simulation month `monthIndex` (0…monthCount−1).
 * Uses midpoints between adjacent `xScale` positions so columns tile the width and match discrete month steps.
 */
export function monthColumnBandInner(
  monthIndex: number,
  monthCount: number,
  innerW: number,
  xScale: d3.ScaleLinear<number, number>,
): { left: number; width: number } {
  if (monthCount <= 0 || innerW <= 0) return { left: 0, width: 0 }
  const i = Math.min(Math.max(0, monthIndex), monthCount - 1)
  if (monthCount === 1) return { left: 0, width: innerW }
  const left = i === 0 ? 0 : (xScale(i - 1)! + xScale(i)!) / 2
  const right = i === monthCount - 1 ? innerW : (xScale(i)! + xScale(i + 1)!) / 2
  return { left, width: Math.max(1, right - left) }
}

export type XAxisMonthTicksOptions = {
  simulationStart?: Date
  /** When set with `simulationStart`, long-horizon ticks show calendar years (e.g. 2026) instead of Y1, Y2. */
  formatCalendarYear?: (calendarYear: number) => string
}

/** X-axis tick indices and labels: calendar years on long horizons, months on short; optional year sub-row on short horizons. */
export function xAxisMonthTicks(
  totalMonths: number,
  formatMonthIndex: (m: number) => string,
  formatYearIndex: (yearIndex: number) => string,
  options?: XAxisMonthTicksOptions,
): {
  tickValues: number[]
  format: (m: number) => string
  /** When non-empty, render a second row of calendar year labels at these month indices (short horizons). */
  yearTickMonths: number[]
} {
  const last = Math.max(0, totalMonths - 1)
  const simStart = options?.simulationStart
  const fmtCal = options?.formatCalendarYear

  if (totalMonths <= 1) {
    return { tickValues: [0], format: (m) => formatMonthIndex(m), yearTickMonths: [] }
  }

  const yearTickMonths: number[] =
    totalMonths <= 48 && simStart && fmtCal ? xAxisYearBoundaryMonths(totalMonths) : []

  if (totalMonths > 48) {
    const step = totalMonths > 240 ? 60 : 12
    const ticks: number[] = []
    for (let m = 0; m <= last; m += step) ticks.push(m)
    if (ticks[ticks.length - 1] !== last) ticks.push(last)
    const format =
      simStart && fmtCal
        ? (m: number) => fmtCal(calendarYearForSimulationMonth(simStart, m))
        : (m: number) => {
            const y = Math.floor(m / 12) + 1
            return formatYearIndex(y)
          }
    return { tickValues: ticks, format, yearTickMonths: [] }
  }
  const step = Math.max(1, Math.ceil(last / 8))
  const ticks: number[] = []
  for (let m = 0; m <= last; m += step) ticks.push(m)
  if (ticks[ticks.length - 1] !== last) ticks.push(last)
  return {
    tickValues: ticks,
    format: (m) => formatMonthIndex(m),
    yearTickMonths,
  }
}

export function eventMarkerXs(events: FinancialEvent[], maxMonth: number): { id: string; month: number }[] {
  const seen = new Set<string>()
  const out: { id: string; month: number }[] = []
  for (const e of events) {
    if (e.startMonth > maxMonth) continue
    if (seen.has(e.id)) continue
    seen.add(e.id)
    out.push({ id: e.id, month: e.startMonth })
  }
  return out.sort((a, b) => a.month - b.month)
}

/**
 * When markers fall within `minPxGap` along X (same or nearby months), assign `stackIndex`
 * so they can be drawn vertically offset and stay readable.
 */
export function layoutStackedGraphEventMarkers(
  markers: { id: string; month: number }[],
  xMax: number,
  innerW: number,
  minPxGap = 26,
): { id: string; month: number; stackIndex: number }[] {
  if (markers.length === 0 || innerW <= 0 || xMax <= 0) return []
  const sorted = [...markers].sort((a, b) => a.month - b.month || a.id.localeCompare(b.id))
  const px = (m: number) => (m / xMax) * innerW
  const out: { id: string; month: number; stackIndex: number }[] = []
  let i = 0
  while (i < sorted.length) {
    let j = i + 1
    while (j < sorted.length && px(sorted[j]!.month) - px(sorted[j - 1]!.month) < minPxGap) {
      j += 1
    }
    for (let k = i; k < j; k++) {
      out.push({ id: sorted[k]!.id, month: sorted[k]!.month, stackIndex: k - i })
    }
    i = j
  }
  return out
}

function milestoneCrossingVisible(m: Milestone, maxMonth: number): boolean {
  if (m.nominalMonth !== null && m.nominalMonth <= maxMonth) return true
  if (m.realMonth !== null && m.realMonth <= maxMonth) return true
  return m.month <= maxMonth
}

export function milestoneLines(
  milestones: Milestone[],
  maxMonth: number,
): Milestone[] {
  return milestones.filter((m) => milestoneCrossingVisible(m, maxMonth))
}

/** Month indices (simulation months) where vertical milestone guides should render. */
export function milestoneLineMonths(m: Milestone, maxMonth: number): number[] {
  const xs = new Set<number>()
  if (m.nominalMonth !== null && m.nominalMonth <= maxMonth) xs.add(m.nominalMonth)
  if (m.realMonth !== null && m.realMonth <= maxMonth) xs.add(m.realMonth)
  if (xs.size === 0 && m.month <= maxMonth) xs.add(m.month)
  return [...xs].sort((a, b) => a - b)
}

/** `nominal` / `real` = which crossing month this guide is; `unified` = both in the same month. */
export type MilestoneSegmentKind = 'nominal' | 'real' | 'unified'

/** One vertical guide per crossing month; `real` is styled separately (inflation-adjusted $). */
export function milestoneSegments(
  m: Milestone,
  maxMonth: number,
): { month: number; kind: MilestoneSegmentKind }[] {
  const nm = m.nominalMonth
  const rm = m.realMonth
  const out: { month: number; kind: MilestoneSegmentKind }[] = []
  for (const xm of milestoneLineMonths(m, maxMonth)) {
    const isNom = nm !== null && xm === nm
    const isReal = rm !== null && xm === rm
    if (isNom && isReal) out.push({ month: xm, kind: 'unified' })
    else if (isReal) out.push({ month: xm, kind: 'real' })
    else if (isNom) out.push({ month: xm, kind: 'nominal' })
    else out.push({ month: xm, kind: 'unified' })
  }
  return out
}

export function milestoneSegmentHoverKey(m: Milestone, kind: MilestoneSegmentKind): string {
  return `${m.id}:${kind}`
}

/** Later nodes paint above earlier — hovered segment labels/lines stay on top. */
export function milestonePaintOrderByKey<T extends { hoverKey: string }>(
  items: T[],
  hoverKey: string | null,
): T[] {
  if (!hoverKey) return items
  return [...items].sort((a, b) => {
    if (a.hoverKey === hoverKey) return 1
    if (b.hoverKey === hoverKey) return -1
    return 0
  })
}

