import { hsl } from 'd3-color'
import type { FinancialEvent } from '../events/types'

/** Event-type palette — architecture §12. */
export const eventTypeColors = {
  career: '#F59E0B',
  asset: '#10B981',
  liability: '#F43F5E',
  investment: '#3B82F6',
  life: '#8B5CF6',
  macro: '#64748B',
} as const

/** Primary UI / graph accent (teal) — replaces generic sky defaults. */
/** Stacked net-worth breakdown — savings pool layer (amber-400). */
export const graphAssetColors = {
  cash: '#334155',
  savingsPool: '#f59e0b',
  investments: '#3b82f6',
  physical: '#10b981',
} as const

/**
 * Softer fills for the stacked area under the net-worth line (dark UI).
 * Lower chroma than `graphAssetColors` so layers read as tinted bands, not competing primaries.
 */
export const graphAssetAreaColors = {
  cash: '#64748b',
  savingsPool: '#a16207',
  /** Underwater savings pool (deficit / reserve borrowing). */
  savingsPoolNegative: '#9f1239',
  investments: '#1e40af',
  physical: '#0f766e',
  /** Gap between gross assets and net worth (loan balances). */
  debt: '#9f1239',
} as const

export const accent = {
  line: '#2dd4bf',
  lineDim: 'rgba(45, 212, 191, 0.45)',
  glow: 'rgba(45, 212, 191, 0.35)',
  fill: 'rgba(45, 212, 191, 0.38)',
  fillFade: 'rgba(45, 212, 191, 0)',
} as const

export function eventColorFor(e: FinancialEvent): string {
  switch (e.kind) {
    case 'career':
      return eventTypeColors.career
    case 'investment':
      return eventTypeColors.investment
    case 'life':
      return eventTypeColors.life
    case 'macro':
      return eventTypeColors.macro
    case 'asset_liability':
      return e.mode === 'liability' ? eventTypeColors.liability : eventTypeColors.asset
  }
}

/** Background tint (hex + alpha) for form cards / list rows. */
export function eventTintHex(color: string, alphaHex = '14'): string {
  if (color.startsWith('#') && color.length === 7) {
    return `${color}${alphaHex}`
  }
  return color
}

/** Total hue spread (degrees) across all investment layers in distinct-ribbon mode. */
const INVESTMENT_RIBBON_HUE_SPREAD = 28

/**
 * Distinct fill for each investment in the contribution ribbon: same base family, varied hue.
 * `index` is 0..`total`-1; stable ordering is caller’s responsibility (e.g. strength order).
 */
export function investmentRibbonFill(baseHex: string, index: number, total: number): string {
  if (total <= 1 || !Number.isFinite(index) || index < 0) return baseHex
  const c = hsl(baseHex)
  if (!Number.isFinite(c.h ?? NaN)) return baseHex
  const t = INVESTMENT_RIBBON_HUE_SPREAD * (index / (total - 1) - 0.5)
  c.h = ((c.h ?? 0) + t + 360) % 360
  c.s = Math.min(0.88, Math.max(0.42, c.s))
  c.l = Math.min(0.6, Math.max(0.38, c.l))
  return c.formatHex()
}
