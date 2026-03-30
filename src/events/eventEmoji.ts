import type { FinancialEvent } from './types'

export function eventEmoji(kind: FinancialEvent['kind']): string {
  switch (kind) {
    case 'career':
      return '💼'
    case 'asset_liability':
      return '🏠'
    case 'investment':
      return '📈'
    case 'life':
      return '👶'
    case 'macro':
      return '🌍'
  }
}
