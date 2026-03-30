import { describe, expect, it } from 'vitest'
import { clientXToMonthIndex, clamp } from './useDragToTimeline'

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

describe('clamp', () => {
  it('clamps to range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })
})

describe('clientXToMonthIndex', () => {
  it('maps left edge to 0 and right to last month', () => {
    const rect = mockRect(100, 0, 400, 200)
    const ml = 40
    const mr = 20
    expect(clientXToMonthIndex(140, rect, 13, ml, mr)).toBe(0)
    expect(clientXToMonthIndex(140 + 340, rect, 13, ml, mr)).toBe(12)
  })

  it('rounds to nearest month', () => {
    const rect = mockRect(0, 0, 100, 50)
    expect(clientXToMonthIndex(50, rect, 3, 0, 0)).toBe(1)
  })
})
