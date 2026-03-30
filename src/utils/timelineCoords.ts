export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** Map pointer X inside chart plot to month index (Stage 7). */
export function clientXToMonthIndex(
  clientX: number,
  plotRect: DOMRect,
  totalMonths: number,
  marginLeft: number,
  marginRight: number,
): number {
  const plotW = plotRect.width - marginLeft - marginRight
  if (plotW <= 0 || totalMonths <= 1) return 0
  const x = clientX - plotRect.left - marginLeft
  const t = clamp(x / plotW, 0, 1)
  const idx = Math.round(t * (totalMonths - 1))
  return clamp(idx, 0, totalMonths - 1)
}

/**
 * Same as `clientXToMonthIndex` but maps the plot width to inclusive visible domain [lo, hi]
 * (simulation month indices). When domain is full [0, xMax] with xMax = totalMonths - 1,
 * results match `clientXToMonthIndex` for the same totalMonths.
 */
export function clientXToMonthIndexInDomain(
  clientX: number,
  plotRect: DOMRect,
  totalMonths: number,
  marginLeft: number,
  marginRight: number,
  domain: readonly [number, number],
): number {
  const plotW = plotRect.width - marginLeft - marginRight
  if (plotW <= 0 || totalMonths <= 1) return 0
  const xMax = Math.max(0, totalMonths - 1)
  const [lo, hi] = domain
  const span = hi - lo
  if (span <= 0) return clamp(Math.round(lo), 0, xMax)
  const x = clientX - plotRect.left - marginLeft
  const t = clamp(x / plotW, 0, 1)
  const continuous = lo + t * span
  const idx = Math.round(continuous)
  return clamp(idx, 0, xMax)
}
