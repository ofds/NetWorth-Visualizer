/**
 * Horizontal strips under the main net-worth plot (contribution ribbon today; room for more).
 * When adding a second band, reserve vertical budget next to `contributions` and keep ids stable.
 */
export type RibbonStripId = 'contributions' | 'future_second'

export const RIBBON_STRIP_IDS = {
  contributions: 'contributions' as const,
  futureSecond: 'future_second' as const,
}
