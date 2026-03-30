import type { AppLang } from '../store/useAppStore'

export function formatLocaleForLang(lang: AppLang): string {
  return lang === 'pt-BR' ? 'pt-BR' : 'en-US'
}

/** First calendar day of simulation month `monthIndex` (0 = start month). */
export function dateForSimulationMonth(simulationStart: Date, monthIndex: number): Date {
  return new Date(
    simulationStart.getFullYear(),
    simulationStart.getMonth() + monthIndex,
    1,
  )
}

/** Locale-aware short month name for graph axis ticks (e.g. Jan / jan.). */
export function formatSimulationMonthShort(
  simulationStart: Date,
  monthIndex: number,
  lang: AppLang,
): string {
  const d = dateForSimulationMonth(simulationStart, monthIndex)
  const locale = formatLocaleForLang(lang)
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(d)
}

/**
 * Stored model currency is often `USD`. In Portuguese UI we show amounts as **reais**
 * (BRL, **R$**) with the same numeric values—no FX conversion.
 */
export function displayCurrencyForStored(storedCurrency: string, lang: AppLang): string {
  if (lang === 'pt-BR' && storedCurrency === 'USD') return 'BRL'
  return storedCurrency
}

/**
 * USD in English: plain `$` + locale grouping. BRL in pt-BR: `Intl` **R$** (not US$).
 */
export function formatCurrency(value: number, currency = 'USD', lang: AppLang = 'en'): string {
  const locale = formatLocaleForLang(lang)
  const code = displayCurrencyForStored(currency, lang)
  const n = Math.round(value)

  if (code === 'USD') {
    const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.abs(n))
    const sign = n < 0 ? '-' : ''
    return `${sign}$${formatted}`
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 0,
    currencyDisplay: code === 'BRL' ? 'symbol' : 'narrowSymbol',
  }).format(n)
}

/** Compact notation for graph milestones / tight labels (e.g. $100K, R$ 1,2 mi). */
export function formatCompactCurrency(value: number, currency = 'USD', lang: AppLang = 'en'): string {
  const locale = formatLocaleForLang(lang)
  const code = displayCurrencyForStored(currency, lang)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatMilestoneDateShort(d: Date, lang: string): string {
  const loc = lang === 'pt-BR' || lang.startsWith('pt') ? 'pt-BR' : 'en-US'
  return d.toLocaleDateString(loc, { month: 'short', year: 'numeric' })
}

/** Integer with grouping, no currency symbol (for split currency + input UI). */
export function formatPlainInteger(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value))
}

/** Where the currency symbol sits relative to the number for this locale/currency. */
export function currencyAffixes(
  currency: string,
  locale: string,
  lang: AppLang,
): { prefix: string; suffix: string } {
  const code = displayCurrencyForStored(currency, lang)
  if (code === 'USD') {
    return { prefix: '$', suffix: '' }
  }
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 0,
    currencyDisplay: code === 'BRL' ? 'symbol' : 'narrowSymbol',
  }).formatToParts(1)
  const idx = parts.findIndex((p) => p.type === 'currency')
  if (idx === -1) return { prefix: '$', suffix: '' }
  const sym = parts[idx]!.value
  const firstInt = parts.findIndex((p) => p.type === 'integer')
  if (firstInt === -1) return { prefix: sym, suffix: '' }
  return idx < firstInt ? { prefix: sym, suffix: '' } : { prefix: '', suffix: sym }
}
