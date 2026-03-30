/**
 * Controlled visible month range for the net-worth chart X axis.
 * `zoomRange` from settings is normalized here so D3 scales and pointer mapping stay consistent.
 */

/** Minimum inclusive span (hi - lo) for a zoomed window; smaller selections are ignored. */
export const MIN_ZOOM_SPAN_MONTHS = 2

/**
 * Months visible in the current window; useful if we later aggregate/downsample by zoom depth.
 */
export function visibleSpanMonths(domain: readonly [number, number]): number {
  return Math.max(0, domain[1] - domain[0])
}

/** Effective [lo, hi] inclusive month indices, clamped to [0, xMax]. */
export function effectiveXDomain(
  xMax: number,
  zoomRange: readonly [number, number] | null,
): readonly [number, number] {
  if (xMax <= 0) return [0, 0]
  if (zoomRange === null) return [0, xMax]
  let lo = Math.round(zoomRange[0])
  let hi = Math.round(zoomRange[1])
  lo = Math.max(0, Math.min(xMax, lo))
  hi = Math.max(0, Math.min(xMax, hi))
  if (hi <= lo) {
    if (lo < xMax) hi = Math.min(xMax, lo + 1)
    else if (lo > 0) {
      hi = lo
      lo = lo - 1
    } else return [0, xMax]
  }
  return [lo, hi]
}

export function isFullXDomain(xMax: number, domain: readonly [number, number]): boolean {
  return xMax <= 0 || (domain[0] === 0 && domain[1] === xMax)
}

/** Snap brush endpoints in data space to month indices and enforce minimum span; returns null if unusable. */
export function domainFromBrushMonths(
  m0: number,
  m1: number,
  xMax: number,
): readonly [number, number] | null {
  let lo = Math.round(Math.min(m0, m1))
  let hi = Math.round(Math.max(m0, m1))
  lo = Math.max(0, Math.min(xMax, lo))
  hi = Math.max(0, Math.min(xMax, hi))
  if (hi - lo < MIN_ZOOM_SPAN_MONTHS) return null
  return [lo, hi]
}

/**
 * Map inner-plot x (0…innerW) to a continuous month value using the same linear mapping as
 * `d3.scaleLinear().domain([lo, hi]).range([0, innerW]).invert(x)`.
 */
export function monthContinuousFromInnerX(
  innerX: number,
  innerW: number,
  xDomain: readonly [number, number],
): number {
  if (innerW <= 0) return xDomain[0]
  const t = Math.min(1, Math.max(0, innerX / innerW))
  return xDomain[0] + t * (xDomain[1] - xDomain[0])
}

/** Map viewport X to inner plot x (0…plotW), clamped. */
export function clientXToInnerPlotX(
  clientX: number,
  plotRect: DOMRect,
  marginLeft: number,
  marginRight: number,
): number {
  const plotW = plotRect.width - marginLeft - marginRight
  if (plotW <= 0) return 0
  const x = clientX - plotRect.left - marginLeft
  return Math.min(plotW, Math.max(0, x))
}

/**
 * Pixel brush in inner coords → new zoom range, or null if drag too short / domain invalid.
 * `xDomain` is the **current** visible domain (before zoom), so nested zooms stay correct.
 */
export function tryZoomRangeAfterBrush(
  innerX0: number,
  innerX1: number,
  innerW: number,
  xDomain: readonly [number, number],
  xMax: number,
  pixelThreshold: number,
): readonly [number, number] | null {
  const x0c = Math.min(innerW, Math.max(0, innerX0))
  const x1c = Math.min(innerW, Math.max(0, innerX1))
  if (Math.abs(x1c - x0c) < pixelThreshold) return null
  const m0 = monthContinuousFromInnerX(x0c, innerW, xDomain)
  const m1 = monthContinuousFromInnerX(x1c, innerW, xDomain)
  return domainFromBrushMonths(m0, m1, xMax)
}

/** Tick values from xAxisMonthTicks filtered to the visible domain (always include endpoints). */
export function filterTickValuesToVisibleDomain(
  tickValues: number[],
  lo: number,
  hi: number,
): number[] {
  const inBand = tickValues.filter((v) => v >= lo && v <= hi)
  const set = new Set<number>(inBand)
  set.add(lo)
  set.add(hi)
  return [...set].sort((a, b) => a - b)
}
