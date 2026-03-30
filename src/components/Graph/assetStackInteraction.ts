import * as d3 from 'd3'

/** Geometry for hit-testing the net-worth asset stack (under-line fill). */
export type AssetStackGeom = {
  innerW: number
  innerH: number
  xScale: d3.ScaleLinear<number, number>
  yScale: d3.ScaleLinear<number, number>
  monthCount: number
  stack: d3.Series<Record<string, number>, string>[]
}

export function pickAssetStackLayer(mx: number, my: number, g: AssetStackGeom): string | null {
  if (mx < 0 || mx > g.innerW || my < 0 || my > g.innerH) return null
  if (!g.stack.length) return null
  const idx = Math.round(g.xScale.invert(mx))
  const i = Math.max(0, Math.min(g.monthCount - 1, idx))
  for (let li = g.stack.length - 1; li >= 0; li--) {
    const layer = g.stack[li]!
    const pt = layer[i]
    if (pt === undefined) continue
    const y0 = g.yScale(pt[0])
    const y1 = g.yScale(pt[1])
    const lo = Math.min(y0, y1)
    const hi = Math.max(y0, y1)
    if (my >= lo && my <= hi) return String(layer.key)
  }
  return null
}

const HOVER_OP = '0.38'
const HOVER_OP_BREAKDOWN = '0.48'
const DEBT_BASE_OPACITY = '0.42'
const DEBT_HOVER_OPACITY = '0.68'

export function applyAssetStackHover(svg: SVGSVGElement | null, hoverKey: string | null): void {
  if (!svg) return
  svg.querySelectorAll('.nw-asset-stack-layer').forEach((node) => {
    const path = node as SVGPathElement
    const key = path.getAttribute('data-stack-key')
    const baseOpacity = path.getAttribute('data-base-opacity') ?? '0.22'
    const on = key !== null && key === hoverKey
    const hoverOp = baseOpacity === '0.3' ? HOVER_OP_BREAKDOWN : HOVER_OP
    path.setAttribute('fill-opacity', on ? hoverOp : baseOpacity)
    if (on) {
      path.setAttribute('stroke', 'rgba(255, 255, 255, 0.2)')
      path.setAttribute('stroke-width', '1')
      path.setAttribute('paint-order', 'stroke fill')
    } else {
      path.removeAttribute('stroke')
      path.removeAttribute('stroke-width')
      path.removeAttribute('paint-order')
    }
  })
}

/** Highlight the liabilities-under-zero fill when hovering the negative-debt area. */
export function applyDebtHover(svg: SVGSVGElement | null, hovering: boolean): void {
  if (!svg) return
  svg.querySelectorAll<SVGPathElement>('.nw-debt-below-zero').forEach((node) => {
    node.setAttribute('fill-opacity', hovering ? DEBT_HOVER_OPACITY : DEBT_BASE_OPACITY)
    if (hovering) {
      node.setAttribute('stroke', 'rgba(255, 255, 255, 0.22)')
      node.setAttribute('stroke-width', '1')
      node.setAttribute('paint-order', 'stroke fill')
    } else {
      node.removeAttribute('stroke')
      node.removeAttribute('stroke-width')
      node.removeAttribute('paint-order')
    }
  })
}
