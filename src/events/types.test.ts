import { describe, expect, it } from 'vitest'
import { eventTypeFromKind } from './types'

describe('eventTypeFromKind', () => {
  it('preserves five top-level event keys', () => {
    expect(eventTypeFromKind('career')).toBe('career')
    expect(eventTypeFromKind('investment')).toBe('investment')
    expect(eventTypeFromKind('life')).toBe('life')
    expect(eventTypeFromKind('macro')).toBe('macro')
    expect(eventTypeFromKind('asset_liability')).toBe('asset_liability')
  })
})
