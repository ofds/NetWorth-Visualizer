import * as d3 from 'd3'
import { describe, expect, it } from 'vitest'
import { pickAssetStackLayer, type AssetStackGeom } from './assetStackInteraction'

function geomFromAssetStack(opts: {
  innerW: number
  innerH: number
  monthCount: number
  keys: string[]
  rows: Record<string, number>[]
  yDomain: [number, number]
}): AssetStackGeom {
  const { innerW, innerH, monthCount, keys, rows, yDomain } = opts
  const xMax = Math.max(1, monthCount - 1)
  const xScale = d3.scaleLinear().domain([0, xMax]).range([0, innerW])
  const yScale = d3.scaleLinear().domain(yDomain).range([innerH, 0])
  const stack = d3.stack<Record<string, number>>().keys(keys)(rows)
  return { innerW, innerH, xScale, yScale, monthCount, stack }
}

describe('pickAssetStackLayer', () => {
  it('returns the topmost stack key whose band contains (mx, my) at that month', () => {
    const monthCount = 8
    const rows = Array.from({ length: monthCount }, () => ({
      cash: 10,
      inv: 20,
      phys: 5,
    }))
    const keys = ['cash', 'inv', 'phys']
    const g = geomFromAssetStack({
      innerW: 400,
      innerH: 300,
      monthCount,
      keys,
      rows,
      yDomain: [0, 50],
    })
    const month = 4
    const mx = g.xScale(month)
    const invLayer = g.stack.find((l) => l.key === 'inv')!
    const pt = invLayer[month]!
    const yLo = Math.min(g.yScale(pt[0]), g.yScale(pt[1]))
    const yHi = Math.max(g.yScale(pt[0]), g.yScale(pt[1]))
    const my = (yLo + yHi) / 2
    expect(pickAssetStackLayer(mx, my, g)).toBe('inv')
  })

  it('returns null outside the plot', () => {
    const rows = [{ cash: 5, inv: 5, phys: 0 }]
    const g = geomFromAssetStack({
      innerW: 200,
      innerH: 200,
      monthCount: 1,
      keys: ['cash', 'inv', 'phys'],
      rows,
      yDomain: [0, 20],
    })
    expect(pickAssetStackLayer(-1, 50, g)).toBeNull()
    expect(pickAssetStackLayer(250, 50, g)).toBeNull()
  })
})
