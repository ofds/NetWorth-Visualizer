import type { FinancialEvent } from './types'

/** Recompute `endMonth` from duration fields after `startMonth` changes. */
export function syncEndFromDuration(e: FinancialEvent): FinancialEvent {
  switch (e.kind) {
    case 'career':
      if (e.durationMonths === null) return { ...e, endMonth: null }
      return { ...e, endMonth: e.startMonth + e.durationMonths - 1 }
    case 'life':
      if (e.durationYears === null) return { ...e, endMonth: null }
      return { ...e, endMonth: e.startMonth + e.durationYears * 12 - 1 }
    case 'macro':
      return { ...e, endMonth: e.startMonth + e.durationYears * 12 - 1 }
    case 'investment':
      if (e.durationYears === null) return { ...e, endMonth: null }
      return { ...e, endMonth: e.startMonth + e.durationYears * 12 - 1 }
    case 'windfall':
      return { ...e, endMonth: e.startMonth }
    default:
      return e
  }
}
