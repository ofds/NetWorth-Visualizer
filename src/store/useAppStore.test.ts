import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultCareerEvent } from '../events/defaults'
import type { InvestmentEvent } from '../events/types'
import { useAppStore } from './useAppStore'

describe('useAppStore', () => {
  beforeEach(() => {
    useAppStore.setState({
      ...useAppStore.getState(),
      projectionYears: 30,
      events: [],
      editingEventId: null,
      selectedEventType: null,
    })
  })

  it('updates projection horizon', () => {
    useAppStore.getState().setProjectionYears(45)
    expect(useAppStore.getState().projectionYears).toBe(45)
  })

  it('replaces events immutably via setter', () => {
    const inv: InvestmentEvent = {
      kind: 'investment',
      id: 'e1',
      startMonth: 0,
      endMonth: null,
      name: 'Index',
      contributionKind: 'recurring',
      initialAmount: 1000,
      monthlyContribution: 100,
      expectedAnnualReturn: 0.07,
      assetClass: 'stocks',
      showVolatilityCone: false,
      durationYears: 20,
    }
    useAppStore.getState().setEvents([inv])
    expect(useAppStore.getState().events).toHaveLength(1)
    expect(useAppStore.getState().events[0]?.name).toBe('Index')
  })

  it('merges graph settings', () => {
    useAppStore.getState().patchGraphSettings({ showRealValues: true })
    expect(useAppStore.getState().graphSettings.showRealValues).toBe(true)
    expect(useAppStore.getState().graphSettings.showMonteCarlo).toBe(false)
  })

  it('stores chart X zoom range on graphSettings', () => {
    useAppStore.getState().patchGraphSettings({ zoomRange: [5, 95] })
    expect(useAppStore.getState().graphSettings.zoomRange).toEqual([5, 95])
    useAppStore.getState().patchGraphSettings({ zoomRange: null })
    expect(useAppStore.getState().graphSettings.zoomRange).toBeNull()
  })

  it('recomputeSimulation clears when there are no events', () => {
    useAppStore.getState().recomputeSimulation()
    expect(useAppStore.getState().simulation).toEqual([])
    expect(useAppStore.getState().milestones).toEqual([])
  })

  it('recomputeSimulation fills snapshots when events exist', () => {
    const career = createDefaultCareerEvent(0)
    career.monthlyGrossIncome = 20_000
    career.effectiveTaxRate = 0
    career.savingsRate = 1
    const inv: InvestmentEvent = {
      kind: 'investment',
      id: 'e2',
      startMonth: 0,
      endMonth: null,
      name: 'Fund',
      contributionKind: 'lump_sum',
      initialAmount: 5000,
      monthlyContribution: 0,
      expectedAnnualReturn: 0,
      assetClass: 'stocks',
      showVolatilityCone: false,
      durationYears: null,
    }
    useAppStore.getState().setEvents([career, inv])
    useAppStore.getState().recomputeSimulation()
    expect(useAppStore.getState().simulation.length).toBeGreaterThan(0)
    expect(useAppStore.getState().simulation[0]!.netWorth).toBeGreaterThan(0)
  })

  it('addEvent mints a fresh id when the proposed id is already on the timeline', () => {
    const base: InvestmentEvent = {
      kind: 'investment',
      id: 'shared-id',
      startMonth: 0,
      endMonth: null,
      name: 'A',
      contributionKind: 'lump_sum',
      initialAmount: 100,
      monthlyContribution: 0,
      expectedAnnualReturn: 0,
      assetClass: 'stocks',
      showVolatilityCone: false,
      durationYears: null,
    }
    useAppStore.getState().addEvent(base)
    useAppStore.getState().addEvent({ ...base, name: 'B' })
    const evs = useAppStore.getState().events
    expect(evs).toHaveLength(2)
    const ids = evs.map((e) => e.id)
    expect(new Set(ids).size).toBe(2)
    expect(ids.filter((id) => id === 'shared-id').length).toBe(1)
  })

  it('reorderEvents moves rows without re-sorting by start month', () => {
    const a: InvestmentEvent = {
      kind: 'investment',
      id: 'a',
      startMonth: 0,
      endMonth: null,
      name: 'A',
      contributionKind: 'lump_sum',
      initialAmount: 1,
      monthlyContribution: 0,
      expectedAnnualReturn: 0,
      assetClass: 'stocks',
      showVolatilityCone: false,
      durationYears: null,
    }
    const b: InvestmentEvent = { ...a, id: 'b', name: 'B', startMonth: 12 }
    useAppStore.getState().setEvents([a, b])
    useAppStore.getState().reorderEvents(0, 1)
    const evs = useAppStore.getState().events
    expect(evs[0]?.id).toBe('b')
    expect(evs[1]?.id).toBe('a')
  })

  it('removeEvent drops only the first row with that id', () => {
    const dup: InvestmentEvent = {
      kind: 'investment',
      id: 'dup',
      startMonth: 0,
      endMonth: null,
      name: 'X',
      contributionKind: 'lump_sum',
      initialAmount: 1,
      monthlyContribution: 0,
      expectedAnnualReturn: 0,
      assetClass: 'stocks',
      showVolatilityCone: false,
      durationYears: null,
    }
    useAppStore.getState().setEvents([dup, { ...dup, name: 'Y' }])
    useAppStore.getState().removeEvent('dup')
    expect(useAppStore.getState().events).toHaveLength(1)
    expect(useAppStore.getState().events[0]!.name).toBe('Y')
  })
})
