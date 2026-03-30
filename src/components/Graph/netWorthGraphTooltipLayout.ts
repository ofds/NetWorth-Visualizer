export const GRAPH_TOOLTIP_DEFAULT_W = 260
export const GRAPH_TOOLTIP_DEFAULT_H = 320
/** Hard floor when resizing — fits net worth + compact reset; handles extend past the box. */
export const GRAPH_TOOLTIP_MIN_W = 168
export const GRAPH_TOOLTIP_MIN_H = 30
/** At or below this height the panel uses stage 0 (single-line micro chrome, no header row). */
export const GRAPH_TOOLTIP_MICRO_MAX_H = 56

/** 0 = minimal … 4 = full (see `computeTooltipDensityStage`). */
export type TooltipDensityStage = 0 | 1 | 2 | 3 | 4

/**
 * Maps tooltip box size to how much detail the panel can show without overflow.
 *
 * - Uses **effective capacity** = area + scroll bonus so **tall** panels (lots of vertical
 *   scroll room) can show richer stages even when width is modest.
 * - **Very tall + narrow** (high aspect ratio, small width) caps the stage: horizontal space
 *   limits labels, deltas, and two-column rows — extra height is mostly scroll, not layout room.
 * - **Short** height still downgrades (less fits without scroll).
 *
 * Stages (highest → lowest detail):
 * - 4: Full — breakdowns, reserve ins/outs, variance sub-lines, full active-event rows.
 * - 3: Compact — same sections; omits “vs prior” variance parentheses; shorter event rows.
 * - 2: Summary — asset rows + active events; accordions stay collapsed (no expanded lists).
 * - 1: Tight — net worth + delta line + asset totals; no active-event list, no accordions.
 * - 0: Micro — net worth figure only (no header row; drag on the value to move).
 */
export function computeTooltipDensityStage(w: number, h: number): TooltipDensityStage {
  const area = w * h
  const minDim = Math.min(w, h)
  /** Extra height beyond a compact header acts like scrollable room for stacked sections. */
  const heightPastCompact = Math.max(0, h - 96)
  const scrollBonus = w * heightPastCompact * 0.12
  const effective = area + scrollBonus

  // Micro: tiny area, or short height (single-row layout — must run before `h < 64` → tight).
  if (minDim < 28 || area < 2_600 || h <= GRAPH_TOOLTIP_MICRO_MAX_H) {
    return 0
  }

  // Shifted-down floors vs old 42k / 62k / 78k area-only thresholds; tall panels gain from `effective`.
  let stage: TooltipDensityStage
  if (effective < 10_000 || h < 64) stage = 1
  else if (effective < 24_000 || h < 100) stage = 2
  else if (effective < 44_000 || h < 152) stage = 3
  else stage = 4

  const aspect = h / w
  /** Tall narrow strip: width is the bottleneck for packed rows, not scroll height. */
  let maxStage: TooltipDensityStage = 4
  if (aspect >= 2.5 && w < 200) {
    maxStage = 2
  } else if (aspect >= 2 && w < 260) {
    maxStage = 3
  }

  return Math.min(stage, maxStage) as TooltipDensityStage
}

/**
 * Horizontal layout for the tooltip: typography and row shape from panel width (not height).
 * Narrow columns use smaller type and stack label/value so rows read as lines, not squeezed columns.
 */
export type TooltipHorizontalLayout = {
  band: 'xs' | 'sm' | 'md' | 'lg'
  /** Label above value (narrow) instead of left/right on one line */
  stackLabelValue: boolean
  rootText: string
  headerBarPad: string
  headerTitle: string
  headerGrabGap: string
  heroNetWorth: string
  body: string
  figures: string
  labelUpper: string
  pxSection: string
  /** Simple label + value rows (cash, assets, …) */
  pairRow: string
  /** Contribution / pool lines with amount on the right */
  listItemRow: string
  /** Delta / reserve primary row (may include chevron) */
  wideButtonRow: string
  nestedCardPad: string
}

export function getTooltipHorizontalLayout(w: number): TooltipHorizontalLayout {
  const band: TooltipHorizontalLayout['band'] =
    w < 200 ? 'xs' : w < 240 ? 'sm' : w < 320 ? 'md' : 'lg'
  const stackLabelValue = w < 220
  const pairRow = stackLabelValue
    ? 'flex flex-col items-stretch gap-0.5'
    : 'flex justify-between gap-2 sm:gap-3'
  const listItemRow = stackLabelValue
    ? 'flex flex-col items-stretch gap-0.5'
    : 'flex justify-between gap-2'
  const wideButtonRow = stackLabelValue
    ? 'flex flex-col items-stretch gap-1'
    : 'flex w-full items-start justify-between gap-2'
  const nestedCardPad = band === 'xs' ? 'p-1.5' : 'p-2'

  return {
    band,
    stackLabelValue,
    rootText: band === 'lg' ? 'text-xs' : band === 'md' ? 'text-[11px]' : 'text-[10px]',
    headerBarPad: stackLabelValue ? 'px-1.5 py-1.5' : 'px-2 py-2',
    headerTitle: band === 'xs' ? 'text-[9px]' : band === 'sm' ? 'text-[10px]' : 'text-[11px]',
    headerGrabGap: stackLabelValue ? 'gap-1' : 'gap-1.5',
    heroNetWorth: band === 'xs' ? 'text-xs' : 'text-sm',
    body: band === 'xs' ? 'text-[10px]' : band === 'sm' ? 'text-[10px]' : 'text-[11px]',
    figures: band === 'xs' ? 'text-[9px]' : 'text-[11px]',
    labelUpper: band === 'xs' ? 'text-[9px]' : 'text-[10px]',
    pxSection: band === 'xs' ? 'px-1.5' : 'px-2.5',
    pairRow,
    listItemRow,
    wideButtonRow,
    nestedCardPad,
  }
}

export type GraphTooltipResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export function applyTooltipEdgeResize(
  edge: GraphTooltipResizeEdge,
  dx: number,
  dy: number,
  s: { w: number; h: number; tx: number; ty: number },
): { w: number; h: number; tx: number; ty: number } {
  let { w, h, tx, ty } = s
  switch (edge) {
    case 'e':
      w += dx
      tx -= dx
      break
    case 'w':
      w -= dx
      break
    case 'n':
      h -= dy
      ty += dy
      break
    case 's':
      h += dy
      break
    case 'nw':
      w -= dx
      h -= dy
      ty += dy
      break
    case 'ne':
      w += dx
      tx -= dx
      h -= dy
      ty += dy
      break
    case 'sw':
      w -= dx
      h += dy
      break
    case 'se':
      w += dx
      tx -= dx
      h += dy
      break
  }
  return { w, h, tx, ty }
}

export function clampTooltipBoxDom(
  plotEl: HTMLElement,
  w: number,
  h: number,
  tx: number,
  ty: number,
): { w: number; h: number; tx: number; ty: number } {
  const pad = 6
  const plotW = plotEl.clientWidth
  const plotH = plotEl.clientHeight
  const maxW = Math.max(0, plotW - 2 * pad)
  const maxH = Math.max(0, plotH - 2 * pad)
  if (maxW <= 0 || maxH <= 0) return { w, h, tx, ty }
  const minW = Math.min(GRAPH_TOOLTIP_MIN_W, maxW)
  const minH = Math.min(GRAPH_TOOLTIP_MIN_H, maxH)
  let cw = w
  let ch = h
  let ctx = tx
  let cty = ty
  for (let i = 0; i < 16; i++) {
    cw = Math.min(Math.max(cw, minW), maxW)
    ch = Math.min(Math.max(ch, minH), maxH)
    const left = plotW - 8 - cw + ctx
    const top = 8 + cty
    const right = left + cw
    const bottom = top + ch
    let dx = 0
    let dy = 0
    if (left < pad) dx = pad - left
    if (right > plotW - pad) dx = plotW - pad - right
    if (top < pad) dy = pad - top
    if (bottom > plotH - pad) dy = plotH - pad - bottom
    if (dx === 0 && dy === 0) break
    ctx += dx
    cty += dy
  }
  cw = Math.min(Math.max(cw, minW), maxW)
  ch = Math.min(Math.max(ch, minH), maxH)
  return { w: Math.round(cw), h: Math.round(ch), tx: ctx, ty: cty }
}

export function clientInElementRect(clientX: number, clientY: number, el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
}
