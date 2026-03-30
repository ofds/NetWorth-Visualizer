export function defaultStep(min: number, max: number): number {
  const span = Math.abs(max - min)
  if (span <= 0) return 1
  if (span < 50) return Math.max(0.01, span / 200)
  if (span < 500) return 1
  return Math.max(1, Math.round(span / 400))
}

export function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[^\d.-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return Number.NaN
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : Number.NaN
}

export function parsePercentInput(raw: string): number {
  const t = raw.trim().replace(',', '.')
  const cleaned = t.replace(/[^\d.-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return Number.NaN
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : Number.NaN
}

export function roundPercent(n: number, decimals: number): number {
  if (decimals <= 0) return Math.round(n)
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

export function formatPercentDisplay(v: number, decimals: number): string {
  if (decimals <= 0) return String(Math.round(v))
  return v.toFixed(decimals).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1').replace(/\.$/, '')
}

export function focusPercentSeed(v: number, decimals: number): string {
  if (decimals <= 0) return String(Math.round(v))
  return formatPercentDisplay(v, decimals)
}

export function focusSeedText(clamped: number, step: number): string {
  if (step >= 1) return String(Math.round(clamped))
  const dec = Math.min(4, (String(step).split('.')[1] ?? '').length || 2)
  return String(Number(clamped.toFixed(dec)))
}
