import { describe, expect, it } from 'vitest'
import {
  clientXToInnerPlotX,
  domainFromBrushMonths,
  effectiveXDomain,
  filterTickValuesToVisibleDomain,
  isFullXDomain,
  monthContinuousFromInnerX,
  tryZoomRangeAfterBrush,
} from './graphXDomain'

describe('effectiveXDomain', () => {
  it('uses full span when zoomRange is null', () => {
    expect(effectiveXDomain(99, null)).toEqual([0, 99])
  })

  it('clamps stored range to data bounds', () => {
    expect(effectiveXDomain(10, [2, 50])).toEqual([2, 10])
  })
})

describe('domainFromBrushMonths', () => {
  it('returns null when span is below minimum', () => {
    expect(domainFromBrushMonths(5, 6, 100)).toBe(null)
  })

  it('accepts wider spans', () => {
    expect(domainFromBrushMonths(0, 5, 100)).toEqual([0, 5])
  })
})

describe('filterTickValuesToVisibleDomain', () => {
  it('includes endpoints', () => {
    expect(filterTickValuesToVisibleDomain([0, 12, 24], 10, 20)).toEqual([10, 12, 20])
  })
})

describe('isFullXDomain', () => {
  it('detects full window', () => {
    expect(isFullXDomain(50, [0, 50])).toBe(true)
    expect(isFullXDomain(50, [0, 49])).toBe(false)
  })
})

describe('monthContinuousFromInnerX', () => {
  it('maps plot edges to domain endpoints', () => {
    const d: readonly [number, number] = [0, 100]
    expect(monthContinuousFromInnerX(0, 200, d)).toBe(0)
    expect(monthContinuousFromInnerX(200, 200, d)).toBe(100)
    expect(monthContinuousFromInnerX(100, 200, d)).toBe(50)
  })

  it('works on a zoomed window', () => {
    const d: readonly [number, number] = [40, 60]
    expect(monthContinuousFromInnerX(0, 100, d)).toBe(40)
    expect(monthContinuousFromInnerX(100, 100, d)).toBe(60)
  })
})

describe('clientXToInnerPlotX', () => {
  it('maps client X into inner plot width with margins', () => {
    const rect = { left: 100, width: 500, top: 0, height: 400 } as DOMRect
    expect(clientXToInnerPlotX(100 + 56, rect, 56, 20)).toBe(0)
    expect(clientXToInnerPlotX(100 + 56 + 424, rect, 56, 20)).toBe(424)
  })
})

describe('tryZoomRangeAfterBrush', () => {
  it('returns null when pixel span is below threshold', () => {
    const d: readonly [number, number] = [0, 99]
    expect(tryZoomRangeAfterBrush(50, 55, 800, d, 99, 8)).toBe(null)
  })

  it('returns a wider month span for a long horizontal drag (full view)', () => {
    const d: readonly [number, number] = [0, 120]
    const next = tryZoomRangeAfterBrush(100, 500, 800, d, 120, 8)
    expect(next).not.toBeNull()
    expect(next![1] - next![0]).toBeGreaterThanOrEqual(2)
    expect(next![0]).toBeGreaterThanOrEqual(0)
    expect(next![1]).toBeLessThanOrEqual(120)
  })

  it('supports right-to-left drag', () => {
    const d: readonly [number, number] = [0, 100]
    const next = tryZoomRangeAfterBrush(700, 100, 800, d, 100, 8)
    const next2 = tryZoomRangeAfterBrush(100, 700, 800, d, 100, 8)
    expect(next).toEqual(next2)
  })
})
