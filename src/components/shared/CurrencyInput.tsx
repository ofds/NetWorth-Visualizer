import { useState } from 'react'

type Props = {
  value: number
  onChange: (n: number) => void
  id?: string
  className?: string
  min?: number
}

function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[^\d.-]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

/** Whole dollars for display/edit — avoids float noise (e.g. pool caps) showing as long decimals. */
function wholeCurrencyString(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return String(Math.round(n))
}

export function CurrencyInput({ value, onChange, id, className = '', min }: Props) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(() => wholeCurrencyString(value))

  const display = editing
    ? local
    : Math.round(Number.isFinite(value) ? value : 0).toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={`tabular-nums ${className}`}
      value={display}
      onFocus={() => {
        setEditing(true)
        setLocal(wholeCurrencyString(value))
      }}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        setEditing(false)
        let n = Math.round(parseMoney(local))
        if (min !== undefined) n = Math.max(min, n)
        onChange(n)
      }}
    />
  )
}
