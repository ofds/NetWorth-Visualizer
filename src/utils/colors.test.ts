import { describe, expect, it } from 'vitest'
import { eventTypeColors, investmentRibbonFill } from './colors'

describe('investmentRibbonFill', () => {
  it('returns base when total <= 1', () => {
    expect(investmentRibbonFill(eventTypeColors.investment, 0, 1)).toBe(eventTypeColors.investment)
  })

  it('returns distinct hexes for two investments', () => {
    const a = investmentRibbonFill(eventTypeColors.investment, 0, 2)
    const b = investmentRibbonFill(eventTypeColors.investment, 1, 2)
    expect(a).toMatch(/^#[0-9a-f]{6}$/i)
    expect(b).toMatch(/^#[0-9a-f]{6}$/i)
    expect(a.toLowerCase()).not.toBe(b.toLowerCase())
  })
})
