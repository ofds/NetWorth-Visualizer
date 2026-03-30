import { describe, expect, it } from 'vitest'
import {
  computeTooltipDensityStage,
  getTooltipHorizontalLayout,
  GRAPH_TOOLTIP_DEFAULT_H,
  GRAPH_TOOLTIP_DEFAULT_W,
  GRAPH_TOOLTIP_MICRO_MAX_H,
  GRAPH_TOOLTIP_MIN_H,
  GRAPH_TOOLTIP_MIN_W,
} from './netWorthGraphTooltipLayout'

describe('computeTooltipDensityStage', () => {
  it('uses full detail at default tooltip size', () => {
    expect(computeTooltipDensityStage(GRAPH_TOOLTIP_DEFAULT_W, GRAPH_TOOLTIP_DEFAULT_H)).toBe(4)
  })

  it('steps down through stages as the panel shrinks', () => {
    expect(computeTooltipDensityStage(400, 400)).toBe(4)
    expect(computeTooltipDensityStage(260, 280)).toBe(4)
    expect(computeTooltipDensityStage(230, 230)).toBe(4)
    expect(computeTooltipDensityStage(160, 160)).toBe(3)
    expect(computeTooltipDensityStage(120, 120)).toBe(2)
    expect(computeTooltipDensityStage(90, 90)).toBe(1)
  })

  it('treats tall panels as richer (scroll capacity), not only by area', () => {
    expect(computeTooltipDensityStage(180, 160)).toBe(3)
    expect(computeTooltipDensityStage(260, 420)).toBe(4)
  })

  it('caps density when the panel is tall but too narrow for packed rows', () => {
    expect(computeTooltipDensityStage(140, 420)).toBe(2)
    expect(computeTooltipDensityStage(168, 600)).toBe(2)
    expect(computeTooltipDensityStage(220, 600)).toBe(3)
    expect(computeTooltipDensityStage(260, 600)).toBe(4)
  })

  it('micro only when extremely small', () => {
    expect(computeTooltipDensityStage(64, 28)).toBe(0)
    expect(computeTooltipDensityStage(50, 50)).toBe(0)
    expect(computeTooltipDensityStage(70, 40)).toBe(0)
  })

  it('micro is reachable at minimum resize height (short panel is stage 0)', () => {
    expect(computeTooltipDensityStage(GRAPH_TOOLTIP_MIN_W, GRAPH_TOOLTIP_MIN_H)).toBe(0)
    expect(computeTooltipDensityStage(GRAPH_TOOLTIP_MIN_W, GRAPH_TOOLTIP_MICRO_MAX_H)).toBe(0)
    expect(computeTooltipDensityStage(GRAPH_TOOLTIP_MIN_W, GRAPH_TOOLTIP_MICRO_MAX_H + 1)).not.toBe(0)
  })
})

describe('getTooltipHorizontalLayout', () => {
  it('uses width bands and stacks label/value when narrow', () => {
    const min = getTooltipHorizontalLayout(GRAPH_TOOLTIP_MIN_W)
    expect(min.band).toBe('xs')
    expect(min.stackLabelValue).toBe(true)
    expect(min.pairRow).toContain('flex-col')

    const wide = getTooltipHorizontalLayout(GRAPH_TOOLTIP_DEFAULT_W)
    expect(wide.band).toBe('md')
    expect(wide.stackLabelValue).toBe(false)
    expect(wide.pairRow).toContain('justify-between')

    expect(getTooltipHorizontalLayout(360).band).toBe('lg')
  })
})
