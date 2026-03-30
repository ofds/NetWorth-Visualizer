import { describe, expect, it } from 'vitest'
import { clientXToMonthIndex, clientXToMonthIndexInDomain, clamp } from './timelineCoords'

function mockRect(x: number, y: number, w: number, h: number): DOMRect {
  return {
    x,
    y,
    width: w,
    height: h,
    top: y,
    left: x,
    right: x + w,
    bottom: y + h,
    toJSON() {
      return {}
    },
  } as DOMRect
}

describe('clientXToMonthIndexInDomain', () => {
  it('matches full-domain mapping when domain is 0..last', () => {
    const rect = mockRect(100, 0, 400, 200)
    const ml = 40
    const mr = 20
    const total = 13
    const xMax = 12
    const full: readonly [number, number] = [0, xMax]
    expect(clientXToMonthIndexInDomain(140, rect, total, ml, mr, full)).toBe(
      clientXToMonthIndex(140, rect, total, ml, mr),
    )
    expect(clientXToMonthIndexInDomain(140 + 340, rect, total, ml, mr, full)).toBe(
      clientXToMonthIndex(140 + 340, rect, total, ml, mr),
    )
  })

  it('maps plot edges to zoomed domain endpoints', () => {
    const rect = mockRect(0, 0, 100, 50)
    const ml = 0
    const mr = 0
    const total = 100
    const domain: readonly [number, number] = [10, 30]
    expect(clientXToMonthIndexInDomain(0, rect, total, ml, mr, domain)).toBe(10)
    expect(clientXToMonthIndexInDomain(100, rect, total, ml, mr, domain)).toBe(30)
  })
})

describe('clamp', () => {
  it('clamps to range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })
})
