import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '../store/useAppStore'
import {
  NWV_STORAGE_KEY,
  loadPersistedSlice,
  savePersistedSlice,
} from './persistStorage'

const store = new Map<string, string>()

describe('persistStorage', () => {
  afterEach(() => {
    store.clear()
    vi.unstubAllGlobals()
  })

  it('round-trips JSON slice', () => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    })

    const slice: Pick<
      AppState,
      'events' | 'projectionYears' | 'currency' | 'currentAge' | 'graphSettings'
    > = {
      events: [],
      projectionYears: 25,
      currency: 'BRL',
      currentAge: 30,
      graphSettings: {
        showRealValues: true,
        showLinearReference: false,
        showAssetBreakdown: true,
        zoomRange: [0, 120] as const,
      },
    }
    savePersistedSlice(slice)
    const raw = store.get(NWV_STORAGE_KEY)
    expect(raw).toBeDefined()
    const loaded = loadPersistedSlice()
    expect(loaded?.projectionYears).toBe(25)
    expect(loaded?.currency).toBe('BRL')
    expect(loaded?.graphSettings?.showRealValues).toBe(true)
  })
})
